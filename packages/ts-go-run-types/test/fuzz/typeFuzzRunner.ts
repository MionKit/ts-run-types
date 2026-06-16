// Phase 2 driver — generate random TYPES, run them through the real pipeline
// (typeFuzzHarness.compileType), and check two tiers of oracle:
//
//   Tier A (resolver/emit, TR1–TR4)  the type must compile cleanly: no
//     resolver crash, no Error diagnostics, every createX site resolved, every
//     emitted module valid JS, the reflection graph knotted, the real factories
//     wired. Always checked.
//   Tier B (value, O1–O7)            when the type wired, the Phase-1 value
//     oracles must hold for it — a generated conforming value validates and
//     round-trips, a one-position corruption is rejected, junk never throws.
//
// Each iteration is seeded: `genShape` draws under `withSeededRandom(iterSeed)`
// and the value stream under a derived seed, so a reported violation replays
// the same type AND the same values from its `seed`. The resolver step between
// them is deterministic from the shape (no entropy), so the split doesn't break
// reproducibility.

import {mixSeed, withSeededRandom} from './seededRng.ts';
import {genShape, DEFAULT_GEN_OPTIONS, type GenOptions} from './typeGen.ts';
import {validValue, corruptValue} from './shapeValue.ts';
import {compileType, type CompiledType} from './typeFuzzHarness.ts';
import {randomJunk} from './fuzzRunner.ts';
import type {ResolverClient} from '../../../vite-plugin-runtypes/src/resolver-client.ts';
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

// One createX call site per fuzzed family + the getRunTypeId reflection site.
const EXPECTED_FN_SITES = 6;
const EXPECTED_REFLECTION_SITES = 1;

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

/** Fixed-count run: generate `iterations` random types and collect every oracle
 *  violation. The resolver client is supplied by the caller (one persistent
 *  --inline-server process amortised across the whole run). **/
export async function runTypeFuzz(client: ResolverClient, options: TypeFuzzOptions = {}): Promise<TypeFuzzReport> {
  const seed = options.seed ?? 0x7ee5;
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const gen: GenOptions = {...DEFAULT_GEN_OPTIONS, ...options.gen};
  const violations: Violation[] = [];
  let runs = 0;

  for (let i = 0; i < iterations; i++) {
    const iterSeed = mixSeed(seed, 'type', i);
    runs++;
    await fuzzOneType(client, iterSeed, gen, violations);
  }
  return {runs, iterations, seed, violations};
}

/** Soak: keep generating types until `durationMs` elapses, logging each
 *  violation as it appears. **/
export async function runTypeFuzzForDuration(
  client: ResolverClient,
  durationMs: number,
  options: TypeFuzzOptions = {},
  onViolation?: (v: Violation) => void
): Promise<TypeFuzzReport> {
  const seed = options.seed ?? Date.now() >>> 0;
  const gen: GenOptions = {...DEFAULT_GEN_OPTIONS, ...options.gen};
  const violations: Violation[] = [];
  let runs = 0;
  let round = 0;
  const deadline = Date.now() + durationMs;

  while (Date.now() < deadline) {
    const iterSeed = mixSeed(seed, 'type', round);
    runs++;
    const before = violations.length;
    await fuzzOneType(client, iterSeed, gen, violations);
    if (onViolation) for (let k = before; k < violations.length; k++) onViolation(violations[k]);
    round++;
  }
  return {runs, iterations: round, seed, violations};
}

/** One type: generate the shape (seeded), compile it through the real pipeline,
 *  run Tier-A then (if wired) Tier-B oracles. **/
async function fuzzOneType(client: ResolverClient, seed: number, gen: GenOptions, out: Violation[]): Promise<void> {
  const shape = withSeededRandom(seed, () => genShape(gen));
  const compiled = await compileType(client, shape);
  checkResolverTier(compiled, seed, out);
  if (!compiled.target) return;
  // Value stream under a derived seed so shape + values both replay from `seed`.
  withSeededRandom(mixSeed(seed, 'value', 0), () => checkValueTier(compiled.target!, shape, seed, out));
}

// --- Tier A: resolver / emit oracles (TR1–TR4) ---
function checkResolverTier(compiled: CompiledType, seed: number, out: Violation[]): void {
  const base = {target: compiled.title, seed, phase: 'compile' as const, value: cut(compiled.source)};

  if (compiled.resolverError) {
    out.push({oracle: 'TR1', message: `resolver crashed on a generated type: ${compiled.resolverError}`, ...base});
    return; // nothing downstream is meaningful after a crash
  }
  if (compiled.errorDiagnostics.length > 0) {
    const codes = compiled.errorDiagnostics.map((d) => d.code).join(', ');
    out.push({oracle: 'TR1', message: `Error-severity diagnostic(s) on a well-formed type: ${codes}`, ...base});
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
  } else if (compiled.entryModuleCount === 0) {
    out.push({oracle: 'TR3', message: 'no entry modules emitted for a type with call sites', ...base});
  }
  if (compiled.wireError) {
    out.push({oracle: 'TR4', message: `could not wire real createX factories from tuples: ${compiled.wireError}`, ...base});
  }
}

// --- Tier B: value oracles (O1–O7) over the wired functions ---
function checkValueTier(target: FuzzTarget, shape: CompiledType['shape'], seed: number, out: Violation[]): void {
  const valid = validValue(shape);
  const validCtx = {seed, phase: 'valid' as const};
  push(out, checkValidAccepted(target, valid, validCtx));
  push(out, checkValidateTotal(target, valid, validCtx));
  push(out, checkErrorsAgree(target, valid, validCtx));
  push(out, checkJsonStable(target, valid, validCtx));
  push(out, checkBinaryStable(target, valid, validCtx));

  const corrupted = corruptValue(shape, valid);
  if (corrupted) {
    const invalidCtx = {seed, phase: 'invalid' as const};
    push(out, checkInvalidRejected(target, corrupted.value, invalidCtx));
    push(out, checkValidateTotal(target, corrupted.value, invalidCtx));
    push(out, checkErrorsAgree(target, corrupted.value, invalidCtx));
  }

  const junk = randomJunk(0);
  const junkCtx = {seed, phase: 'junk' as const};
  push(out, checkValidateTotal(target, junk, junkCtx));
  push(out, checkErrorsAgree(target, junk, junkCtx));
}

function push(out: Violation[], violation: Violation | null): void {
  if (violation) out.push(violation);
}

function cut(text: string): string {
  return snapshot(text);
}
