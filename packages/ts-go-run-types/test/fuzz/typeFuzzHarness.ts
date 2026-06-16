// Phase 2 harness — turn a generated TypeShape into REAL compiled runtime
// functions by driving the actual resolver → plugin → runtime pipeline:
//
//   render `.ts` source with createX<T>() call sites
//     → ResolverClient (--inline-server) setSources + scanFiles
//     → entryModules (the per-entry virtual modules the plugin would serve)
//     → evalEntryModules (execute them into their positional tuples)
//     → pass each tuple as the injected id to the REAL createX factory
//       (createValidate(undefined, undefined, tuple) → initFromTuple links the
//        whole dependency closure into the live rtUtils, exactly as a rewritten
//        call site would at runtime).
//
// The resolver-side observations (diagnostics, site coverage, module eval) are
// the Tier-A oracle inputs; the wired functions are the Tier-B (O1–O7) inputs.
//
// Reuses the proven in-process substrate from the vite plugin's test helpers
// (RUNTYPES_DTS overlay + evalEntryModules + instantiateRunTypes) so this never
// reimplements the entry-module linker.

import path from 'node:path';
import {
  createValidate,
  createGetValidationErrors,
  createJsonEncoder,
  createJsonDecoder,
  createBinaryEncoder,
  createBinaryDecoder,
} from '@mionjs/ts-go-run-types';
import {ResolverClient} from '../../../vite-plugin-runtypes/src/resolver-client.ts';
import {
  RUNTYPES_DTS,
  evalEntryModules,
  instantiateRunTypes,
  BIN,
  hasBinary,
} from '../../../vite-plugin-runtypes/test/helpers/inline.ts';
import {Severity, type Diagnostic, type Site} from '../../../vite-plugin-runtypes/src/protocol.ts';
import type {RunType} from '../../src/runtypes/types.ts';
import {renderType, describeShape, type TypeShape} from './typeGen.ts';
import {validValue} from './shapeValue.ts';
import type {FuzzTarget} from './fuzzOracle.ts';

export {hasBinary, BIN};

const REPO_ROOT = path.resolve(__dirname, '../../../..');
const FIXTURE = 'g.ts';

// Map an entry tuple's slot-0 family tag → the createX factory whose injected
// id it is. JSON composites carry per-strategy tags (Go: jsonCompositeTags),
// all of which route back to the encoder/decoder pair.
const ENCODER_TAGS = new Set(['jeCL', 'jeMU', 'jeDI']);
const DECODER_TAGS = new Set(['jdST', 'jdPR']);

export interface CompiledType {
  shape: TypeShape;
  title: string;
  source: string;
  // --- Tier-A resolver/emit observations ---
  diagnostics: Diagnostic[];
  errorDiagnostics: Diagnostic[];
  sites: Site[];
  fnSiteCount: number;
  reflectionSiteCount: number;
  entryModuleCount: number;
  /** Set when the resolver itself failed the scan (crash / protocol error). **/
  resolverError?: string;
  /** Set when evaluating the emitted entry modules / knotting the reflection
   *  graph threw (i.e. the emitter produced invalid JS or a dangling ref). **/
  evalError?: string;
  /** Set when wiring the real createX factories from the tuples threw. **/
  wireError?: string;
  /** The reflected root RunType (when getRunTypeId emitted a bundle). **/
  schema?: RunType;
  /** Fully-wired runtime functions — present only when nothing above failed. **/
  target?: FuzzTarget;
}

/** Open a persistent inline-server resolver. One process serves every
 *  iteration via setSources; the caller must `close()` it. **/
export function openClient(): ResolverClient {
  if (!hasBinary()) throw new Error(`ts-go-run-types binary not built: ${BIN}`);
  return new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true, emitMode: 'both'});
}

/** Render the fixture source for a shape: a `type T` declaration plus one call
 *  site per fuzzed family. getRunTypeId drives the reflection bundle. **/
export function renderFixture(shape: TypeShape): string {
  return `import {
  createValidate,
  createGetValidationErrors,
  createJsonEncoder,
  createJsonDecoder,
  createBinaryEncoder,
  createBinaryDecoder,
  getRunTypeId,
} from '@mionjs/ts-go-run-types';
type T = ${renderType(shape)};
createValidate<T>();
createGetValidationErrors<T>();
createJsonEncoder<T>();
createJsonDecoder<T>();
createBinaryEncoder<T>();
createBinaryDecoder<T>();
getRunTypeId<T>();
`;
}

/** Drive the full pipeline for one shape and return everything the oracles
 *  need. Never throws — every failure mode is captured on the result so the
 *  runner can record it as a violation with its seed. **/
export async function compileType(client: ResolverClient, shape: TypeShape): Promise<CompiledType> {
  const source = renderFixture(shape);
  const title = describeShape(shape);
  const base: CompiledType = {
    shape,
    title,
    source,
    diagnostics: [],
    errorDiagnostics: [],
    sites: [],
    fnSiteCount: 0,
    reflectionSiteCount: 0,
    entryModuleCount: 0,
  };

  let resp;
  try {
    await client.setSources({'runtypes.d.ts': RUNTYPES_DTS, [FIXTURE]: source});
    resp = await client.scanFiles([FIXTURE], {includeEntryModules: true});
  } catch (err) {
    return {...base, resolverError: errMsg(err)};
  }

  const diagnostics = resp.diagnostics ?? [];
  const errorDiagnostics = diagnostics.filter((d) => d.severity === Severity.Error);
  const sites = resp.sites ?? [];
  const fnSites = sites.filter((s) => s.fnId);
  const reflectionSites = sites.filter((s) => !s.fnId);
  const entryModules = resp.entryModules ?? {};
  const partial: CompiledType = {
    ...base,
    diagnostics,
    errorDiagnostics,
    sites,
    fnSiteCount: fnSites.length,
    reflectionSiteCount: reflectionSites.length,
    entryModuleCount: Object.keys(entryModules).length,
  };

  // Tier-A: evaluating the emitted modules executes the generated factory code
  // (catches invalid-JS emit); instantiateRunTypes knots the reflection graph
  // (catches dangling refs). Either throwing is a finding, not a harness error.
  let tuples: Record<string, readonly unknown[]>;
  // instantiateRunTypes returns the vite-plugin's RunType view; the marker
  // package's FuzzTarget keys on its own RunType. They're structurally the
  // reflection node — kept as `unknown` here and cast at the FuzzTarget edge
  // (the oracles never read `schema`).
  let byHash: Record<string, unknown>;
  try {
    tuples = evalEntryModules(entryModules);
    byHash = instantiateRunTypes(tuples);
  } catch (err) {
    return {...partial, evalError: errMsg(err)};
  }

  const reflectionId = reflectionSites[0]?.id;
  const schema = (reflectionId ? byHash[reflectionId] : undefined) as RunType | undefined;

  // Tier-B: wire the real runtime functions from each fn site's tuple.
  try {
    const byFamily = classifyFnSites(fnSites, tuples);
    const need = ['val', 'verr', 'jenc', 'jdec', 'tb', 'fb'] as const;
    for (const slot of need) {
      if (!byFamily[slot]) throw new Error(`missing ${slot} entry tuple among [${Object.keys(tuples).join(', ')}]`);
    }
    const target: FuzzTarget = {
      title,
      schema: schema ?? ({kind: 0} as RunType),
      mock: () => validValue(shape),
      validate: createValidate(undefined, undefined, byFamily.val as never),
      getValidationErrors: createGetValidationErrors(
        undefined,
        undefined,
        byFamily.verr as never
      ) as FuzzTarget['getValidationErrors'],
      jsonEncode: createJsonEncoder(undefined, undefined, byFamily.jenc as never),
      jsonDecode: createJsonDecoder(undefined, undefined, byFamily.jdec as never),
      binaryEncode: createBinaryEncoder(undefined, undefined, byFamily.tb as never) as FuzzTarget['binaryEncode'],
      binaryDecode: createBinaryDecoder(undefined, undefined, byFamily.fb as never) as FuzzTarget['binaryDecode'],
    };
    return {...partial, schema, target};
  } catch (err) {
    return {...partial, schema, wireError: errMsg(err)};
  }
}

interface FamilyTuples {
  val?: readonly unknown[];
  verr?: readonly unknown[];
  jenc?: readonly unknown[];
  jdec?: readonly unknown[];
  tb?: readonly unknown[];
  fb?: readonly unknown[];
}

// Route each fn site's injected tuple to its createX slot by the tuple's
// family tag (order-independent and robust to the resolver returning sites in
// any order).
function classifyFnSites(fnSites: Site[], tuples: Record<string, readonly unknown[]>): FamilyTuples {
  const out: FamilyTuples = {};
  for (const site of fnSites) {
    const tuple = tuples[`${site.fnId}_${site.id}`];
    if (!tuple) continue;
    const tag = tuple[0];
    if (tag === 'val') out.val = tuple;
    else if (tag === 'verr') out.verr = tuple;
    else if (tag === 'tb') out.tb = tuple;
    else if (tag === 'fb') out.fb = tuple;
    else if (typeof tag === 'string' && ENCODER_TAGS.has(tag)) out.jenc = tuple;
    else if (typeof tag === 'string' && DECODER_TAGS.has(tag)) out.jdec = tuple;
  }
  return out;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? (err.stack ?? err.message) : String(err);
}
