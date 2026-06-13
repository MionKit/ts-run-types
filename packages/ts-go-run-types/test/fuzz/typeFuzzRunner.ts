// Phase 2 driver — generate random TYPES across the widest space (typeGen.ts),
// run each through the real pipeline (typeFuzzHarness.compileType), and check
// oracles whose tier is chosen from the RESOLVER'S OWN diagnostics:
//
//   Tier A — resolver/emit robustness (TR1–TR4), checked on EVERY type:
//     TR1 no resolver crash
//     TR2 every createX<T>() resolved to a site (6 fn + 1 reflection)
//     TR3 every emitted module is valid JS (evaluates) + the reflection graph
//         knots (no dangling ref)
//     TR4 a CLEAN type (no Error diagnostics) wires every factory without
//         throwing  (a non-serialisable type is allowed to degrade to
//         alwaysThrow — that's the contract, not a bug)
//
//   Tier B — behaviour, tier chosen from diagnostics:
//     • clean + serialisable  → strong value oracles O1–O7 (O2 only when
//       nothing is dropped, i.e. no warnings)
//     • everything else (Error diagnostics, or a non-value-generable type)
//       → robustness probe: validate / getValidationErrors must return sanely
//       or throw an ERROR (never a non-Error, never crash the process)
//
// Each iteration seeds the type AND its value stream from one number, so a
// reported violation replays exactly.

import {mixSeed, withSeededRandom} from './seededRng.ts';
import {genType, describeType, isRecursive, DEFAULT_GEN_OPTIONS, type GeneratedType, type GenOptions} from './typeGen.ts';
import {genValidValue, validValue, corruptValue, valueOracleSafe} from './shapeValue.ts';
import {compileType, openClient, renderFixture, type CompiledType, type WiredFns} from './typeFuzzHarness.ts';
import {randomJunk} from './fuzzRunner.ts';
import type {ResolverClient} from '../../../vite-plugin-runtypes/src/resolver-client.ts';
import type {RunType} from '../../src/runtypes/types.ts';
import {
  checkBinaryStable,
  checkErrorsAgree,
  checkInvalidRejected,
  checkJsonStable,
  checkValidAccepted,
  checkValidateTotal,
  snapshot,
  type FuzzTarget,
  type Violation,
} from './fuzzOracle.ts';

const EXPECTED_FN_SITES = 6;
const EXPECTED_REFLECTION_SITES = 1;
const FN_KEYS: (keyof WiredFns)[] = [
  'validate',
  'getValidationErrors',
  'jsonEncode',
  'jsonDecode',
  'binaryEncode',
  'binaryDecode',
];

export interface TypeFuzzOptions {
  seed?: number;
  iterations?: number;
  gen?: Partial<GenOptions>;
}

export interface TypeFuzzReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: Violation[];
}

const DEFAULT_ITERATIONS = 60;
// A generous per-type ceiling: with disjoint-named intersections the resolver
// handles the wild space in tens of ms, so anything this slow is a genuine
// pathology worth flagging (and the wedged client is restarted so the run goes on).
const COMPILE_TIMEOUT_MS = 10_000;

// Owns the inline-server resolver and can restart it after a hang (a single
// unanswered request wedges the whole request queue, so we kill + respawn).
class ClientHolder {
  private client: ResolverClient | null = null;
  get(): ResolverClient {
    if (!this.client) this.client = openClient();
    return this.client;
  }
  restart(): void {
    try {
      this.client?.close();
    } catch {
      /* already dead */
    }
    this.client = openClient();
  }
  close(): void {
    try {
      this.client?.close();
    } catch {
      /* already dead */
    }
    this.client = null;
  }
}

export async function runTypeFuzz(options: TypeFuzzOptions = {}): Promise<TypeFuzzReport> {
  const seed = options.seed ?? 0x7ee5;
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const gen: GenOptions = {...DEFAULT_GEN_OPTIONS, ...options.gen};
  const violations: Violation[] = [];
  const holder = new ClientHolder();
  let runs = 0;
  try {
    for (let i = 0; i < iterations; i++) {
      runs++;
      await fuzzOneType(holder, mixSeed(seed, 'type', i), gen, violations);
    }
  } finally {
    holder.close();
  }
  return {runs, iterations, seed, violations};
}

export async function runTypeFuzzForDuration(
  durationMs: number,
  options: TypeFuzzOptions = {},
  onViolation?: (v: Violation) => void
): Promise<TypeFuzzReport> {
  const seed = options.seed ?? Date.now() >>> 0;
  const gen: GenOptions = {...DEFAULT_GEN_OPTIONS, ...options.gen};
  const violations: Violation[] = [];
  const holder = new ClientHolder();
  let runs = 0;
  let round = 0;
  const deadline = Date.now() + durationMs;
  try {
    while (Date.now() < deadline) {
      runs++;
      const before = violations.length;
      await fuzzOneType(holder, mixSeed(seed, 'type', round), gen, violations);
      if (onViolation) for (let k = before; k < violations.length; k++) onViolation(violations[k]);
      round++;
    }
  } finally {
    holder.close();
  }
  return {runs, iterations: round, seed, violations};
}

async function fuzzOneType(holder: ClientHolder, seed: number, gen: GenOptions, out: Violation[]): Promise<void> {
  const generated = withSeededRandom(seed, () => genType(gen));
  const compiled = await compileWithTimeout(holder, generated, seed, out);
  if (!compiled) return; // timed out — violation recorded, client restarted
  checkResolverTier(compiled, seed, out);
  withSeededRandom(mixSeed(seed, 'value', 0), () => checkBehaviourTier(compiled, seed, out));
}

// Race compileType against a timeout. On timeout, record a TR1 finding and
// restart the (now wedged) resolver. The abandoned compile promise is detached
// with a no-op catch so its eventual rejection (resolver killed) is not unhandled.
async function compileWithTimeout(
  holder: ClientHolder,
  gen: GeneratedType,
  seed: number,
  out: Violation[]
): Promise<CompiledType | null> {
  const compile = compileType(holder.get(), gen);
  compile.catch(() => {});
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<'timeout'>((res) => {
    timer = setTimeout(() => res('timeout'), COMPILE_TIMEOUT_MS);
  });
  const result = await Promise.race([compile, timeout]);
  clearTimeout(timer!);
  if (result === 'timeout') {
    out.push({
      oracle: 'TR1',
      target: describeType(gen),
      seed,
      phase: 'compile',
      message: `resolver did not respond within ${COMPILE_TIMEOUT_MS}ms (possible pathological type / hang)`,
      value: snapshot(renderFixture(gen)),
    });
    holder.restart();
    return null;
  }
  return result;
}

// --- Tier A: resolver / emit robustness ---
function checkResolverTier(compiled: CompiledType, seed: number, out: Violation[]): void {
  const base = {target: compiled.title, seed, phase: 'compile' as const, value: snapshot(compiled.source)};

  if (compiled.resolverError) {
    out.push({oracle: 'TR1', message: `resolver crashed on a generated type: ${compiled.resolverError}`, ...base});
    return;
  }
  if (compiled.fnSiteCount !== EXPECTED_FN_SITES || compiled.reflectionSiteCount !== EXPECTED_REFLECTION_SITES) {
    out.push({
      oracle: 'TR2',
      message: `site coverage mismatch: ${compiled.fnSiteCount} fn + ${compiled.reflectionSiteCount} reflection (want ${EXPECTED_FN_SITES} + ${EXPECTED_REFLECTION_SITES})`,
      ...base,
    });
  }
  if (compiled.evalError) {
    out.push({
      oracle: 'TR3',
      message: `emitted module failed to evaluate (invalid JS or dangling ref): ${compiled.evalError}`,
      ...base,
    });
    return;
  }
  if (compiled.entryModuleCount === 0) {
    out.push({oracle: 'TR3', message: 'no entry modules emitted for a type with call sites', ...base});
  }
  // TR4: a clean type (no Error diagnostics) must wire every factory. A
  // non-serialisable type legitimately degrades to alwaysThrow — allowed.
  // Recursive types are exempt: the in-process linker can't materialise a cyclic
  // function graph (the real CircularRefs suite covers their runtime), so wiring
  // them in-process is a harness limitation, not a product defect.
  if (!isRecursive(compiled.gen)) {
    for (const key of FN_KEYS) {
      const err = compiled.wireErrors[key];
      // A CONTROLLED alwaysThrow (`[CODE] …`) is the contract for a
      // non-serialisable type — expected. Only an UNCONTROLLED wire failure is a
      // bug (e.g. a TypeError from the runtime / a malformed factory).
      if (err && !isControlledThrow(err)) {
        out.push({oracle: 'TR4', message: `factory ${key} failed to wire with an uncontrolled error: ${err}`, ...base});
      }
    }
  }
}

// alwaysThrow diagnostics format their message as `[CODE] …` (diagnosticCatalog).
function isControlledThrow(message: string): boolean {
  return /^\[[A-Z][A-Z0-9]*\]/.test(message);
}

// --- Tier B: behaviour ---
function checkBehaviourTier(compiled: CompiledType, seed: number, out: Violation[]): void {
  if (compiled.resolverError || compiled.evalError) return;
  // Recursive types: resolve/emit/reflection were already policed (TR1–TR3);
  // their runtime is covered by the real CircularRefs suite. The in-process
  // linker can't execute a cyclic function graph, so skip the behaviour tier.
  if (isRecursive(compiled.gen)) return;
  const serialisable = valueOracleSafe(compiled.gen);
  const target = asFuzzTarget(compiled);

  if (serialisable && target) {
    // A truncated (floored) recursive value may not fully conform — fall back to
    // the robustness probe rather than risk a false O1.
    const {value, floored} = genValidValue(compiled.gen);
    if (floored) runRobustnessProbe(compiled, seed, out);
    else runValueOracles(compiled, target, value, seed, out);
  } else {
    runRobustnessProbe(compiled, seed, out);
  }
}

// Strong/medium value oracles over a conforming value. O2 (corruption) is only
// sound when nothing is dropped (no warnings) — a corrupted dropped member would
// still validate.
function runValueOracles(compiled: CompiledType, target: FuzzTarget, valid: unknown, seed: number, out: Violation[]): void {
  const validCtx = {seed, phase: 'valid' as const};
  push(out, checkValidAccepted(target, valid, validCtx));
  push(out, checkValidateTotal(target, valid, validCtx));
  push(out, checkErrorsAgree(target, valid, validCtx));
  push(out, checkJsonStable(target, valid, validCtx));
  push(out, checkBinaryStable(target, valid, validCtx));

  if (compiled.warningDiagnostics.length === 0) {
    const corrupted = corruptValue(compiled.gen, valid);
    if (corrupted) {
      const invalidCtx = {seed, phase: 'invalid' as const};
      push(out, checkInvalidRejected(target, corrupted.value, invalidCtx));
      push(out, checkValidateTotal(target, corrupted.value, invalidCtx));
      push(out, checkErrorsAgree(target, corrupted.value, invalidCtx));
    }
  }

  const junk = randomJunk(0);
  const junkCtx = {seed, phase: 'junk' as const};
  push(out, checkValidateTotal(target, junk, junkCtx));
  push(out, checkErrorsAgree(target, junk, junkCtx));
}

// For non-serialisable / error-diagnostic types we can't assert acceptance, but
// the runtime must still be ROBUST: a wired validate / getValidationErrors must
// return a sane shape or throw an ERROR — never a non-Error, never hang/crash.
function runRobustnessProbe(compiled: CompiledType, seed: number, out: Violation[]): void {
  const base = {target: compiled.title, seed, phase: 'junk' as const, value: snapshot(compiled.source)};
  const samples: unknown[] = [randomJunk(0), randomJunk(0), {}, [], null, undefined, 'x', 42];
  const {validate, getValidationErrors} = compiled.wired;

  for (const sample of samples) {
    if (validate) {
      try {
        const r = validate(sample);
        if (typeof r !== 'boolean')
          out.push({
            oracle: 'O3',
            message: `validate returned a non-boolean (${typeof r}) on a wild type`,
            ...base,
            value: snapshot(sample),
          });
      } catch (err) {
        if (!(err instanceof Error))
          out.push({
            oracle: 'O3',
            message: `validate threw a non-Error (${typeof err}) on a wild type`,
            ...base,
            value: snapshot(sample),
          });
      }
    }
    if (getValidationErrors) {
      try {
        const r = getValidationErrors(sample);
        if (!Array.isArray(r))
          out.push({
            oracle: 'O4',
            message: `getValidationErrors returned a non-array (${typeof r}) on a wild type`,
            ...base,
            value: snapshot(sample),
          });
      } catch (err) {
        if (!(err instanceof Error))
          out.push({
            oracle: 'O4',
            message: `getValidationErrors threw a non-Error (${typeof err}) on a wild type`,
            ...base,
            value: snapshot(sample),
          });
      }
    }
  }
}

function asFuzzTarget(compiled: CompiledType): FuzzTarget | null {
  const w = compiled.wired;
  if (!w.validate || !w.getValidationErrors || !w.jsonEncode || !w.jsonDecode || !w.binaryEncode || !w.binaryDecode) return null;
  return {
    title: compiled.title,
    schema: {kind: 0} as RunType,
    mock: () => validValue(compiled.gen),
    validate: w.validate,
    getValidationErrors: w.getValidationErrors,
    jsonEncode: w.jsonEncode,
    jsonDecode: w.jsonDecode,
    binaryEncode: w.binaryEncode,
    binaryDecode: w.binaryDecode,
  };
}

function push(out: Violation[], violation: Violation | null): void {
  if (violation) out.push(violation);
}
