// Size-estimate fuzz driver — for each (config, seed) it generates a random
// SERIALISABLE type (the existing typeGen, DATA_GEN_OPTIONS), compiles it with
// that estimator config (so the baked seed matches), then sources values from
// the product `createMockType` with `respectBinarySize`:
//   - true  -> an in-bounds value: the cold buffer MUST NOT resize + round-trips
//   - false -> an oversized value: the cold buffer MUST resize + round-trips
//
// The oracle is dumb (sizeOracle.ts) — all the "does it fit?" logic lives in
// createMockType's bounds (applyInBoundsSizing) and the matching estimate
// (binary_size_estimate.go). Mirrors typeFuzzRunner.ts: deterministic
// per-iteration seeds (mixSeed) and a duration-based soak variant. Bias stays 1
// (in-bounds == within the capped max); items / stringBytes / maxBytes vary,
// including adversarial small-stringBytes configs that stress the string / key
// reserve floors.

import {createMockType} from 'ts-runtypes';
import type {BinarySizingOptions} from '../../../src/mocking/mockTypes.ts';
import {mixSeed, withSeededRandom} from '../core/seededRng.ts';
import {genType, isRecursive, DATA_GEN_OPTIONS} from '../core/typeGen.ts';
import {openClient, compileType, hasBinary, BIN, type CompiledType} from '../type/typeFuzzHarness.ts';
import {checkInBounds, checkOversized, type SizeViolation} from './sizeOracle.ts';
import {sizeLaneEligible} from './sizeEligible.ts';

export {hasBinary, BIN};

/** Bias-1 configs that vary the count / string / cap anchors (and one clamped
 *  cap). Bias 1 keeps createMockType's in-bounds bounding exact. The last two are
 *  ADVERSARIAL: tiny stringBytes with mismatched items stresses the string / regexp
 *  / index-sig-key reserve floors the audit surfaced (where comparably-sized
 *  configs mask the under-budget). **/
export const SIZE_CONFIGS: ReadonlyArray<Required<BinarySizingOptions>> = [
  {sizeBias: 1, sizeItems: 8, sizeStringBytes: 8, sizeMaxBytes: 65536},
  {sizeBias: 1, sizeItems: 32, sizeStringBytes: 24, sizeMaxBytes: 65536},
  {sizeBias: 1, sizeItems: 64, sizeStringBytes: 48, sizeMaxBytes: 65536},
  {sizeBias: 1, sizeItems: 40, sizeStringBytes: 32, sizeMaxBytes: 2048}, // tight cap -> exercise the clamp
  {sizeBias: 1, sizeItems: 2, sizeStringBytes: 1, sizeMaxBytes: 65536}, // tiny strings + index-sig keys
  {sizeBias: 1, sizeItems: 64, sizeStringBytes: 4, sizeMaxBytes: 65536}, // many items, sub-floor strings
];

export interface SizeFuzzOptions {
  seed?: number;
  /** Total types to generate across all configs. **/
  iterations?: number;
}

export interface SizeFuzzStats {
  /** In-bounds values run through the no-resize lane (every checked type). **/
  noGrowChecked: number;
  /** Oversized values that genuinely exceeded the seed and exercised the grow path. **/
  negativesExercised: number;
  /** Types skipped (resolver/eval error, recursive, no estimate slot, clamped seed). **/
  skipped: number;
}

export interface SizeFuzzReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: SizeViolation[];
  stats: SizeFuzzStats;
}

const DEFAULT_SEED = 0xc0ffee;
const DEFAULT_ITERATIONS = 80;

interface OneResult {
  violations: SizeViolation[];
  noGrow: number;
  exercised: number;
  skipped: number;
}

function makeMock(compiled: CompiledType, respectBinarySize: boolean, binarySizingOptions: BinarySizingOptions): () => unknown {
  return createMockType(
    undefined,
    {mock: {respectBinarySize, binarySizingOptions}},
    compiled.reflectionTuple as never
  ) as () => unknown;
}

// Compile + check a single generated type. Never throws.
async function runOne(
  client: ReturnType<typeof openClient>,
  cfg: Required<BinarySizingOptions>,
  iterSeed: number
): Promise<OneResult> {
  const out: OneResult = {violations: [], noGrow: 0, exercised: 0, skipped: 0};
  const gen = withSeededRandom(iterSeed, () => genType(DATA_GEN_OPTIONS));
  // The in-process linker can't faithfully run a cyclic factory graph (typeFuzz
  // restricts recursive types to the resolver/emit oracles) — skip them here.
  // sizeLaneEligible only excludes the non-data leaves DATA_GEN doesn't emit.
  if (isRecursive(gen) || !sizeLaneEligible(gen)) {
    out.skipped = 1;
    return out;
  }
  const compiled = await compileType(client, gen);
  if (
    compiled.resolverError ||
    compiled.evalError ||
    compiled.errorDiagnostics.length ||
    compiled.seed === undefined ||
    !compiled.binarySizer ||
    !compiled.wired.binaryEncode ||
    !compiled.reflectionTuple
  ) {
    out.skipped = 1;
    return out;
  }
  // A clamped estimate (a subtree exceeded sizeMaxBytes -> the whole seed is
  // >= sizeMaxBytes) deliberately under-allocates so a huge declared type doesn't
  // seed a multi-MB cold buffer; grow-in-place covers it. The todo scopes this
  // "larger than the rules assume" case OUT, so skip in-bounds checking it.
  if (compiled.seed >= cfg.sizeMaxBytes) {
    out.skipped = 1;
    return out;
  }
  const ctx = {seed: iterSeed};

  let inBoundsValue: unknown;
  let oversizedValue: unknown;
  try {
    inBoundsValue = withSeededRandom(mixSeed(iterSeed, 'value', 0), () => makeMock(compiled, true, cfg)());
    oversizedValue = withSeededRandom(mixSeed(iterSeed, 'over', 0), () => makeMock(compiled, false, cfg)());
  } catch {
    out.skipped = 1; // mock wiring degraded (alwaysThrow factory etc.)
    return out;
  }

  out.violations.push(...checkInBounds(compiled, inBoundsValue, ctx));
  out.noGrow = 1;

  const neg = checkOversized(compiled, oversizedValue, ctx);
  if (neg.violation) out.violations.push(neg.violation);
  if (neg.exercised) out.exercised = 1;
  return out;
}

function emptyStats(): SizeFuzzStats {
  return {noGrowChecked: 0, negativesExercised: 0, skipped: 0};
}

/** Run a fixed number of generated types, distributed across the configs. **/
export async function runSizeFuzz(options: SizeFuzzOptions = {}): Promise<SizeFuzzReport> {
  if (!hasBinary()) throw new Error(`ts-runtypes binary not built: ${BIN}`);
  const seed = options.seed ?? DEFAULT_SEED;
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const perConfig = Math.ceil(iterations / SIZE_CONFIGS.length);
  const violations: SizeViolation[] = [];
  const stats = emptyStats();
  let runs = 0;

  for (let c = 0; c < SIZE_CONFIGS.length; c++) {
    const cfg = SIZE_CONFIGS[c];
    const client = openClient(cfg);
    try {
      for (let i = 0; i < perConfig && runs < iterations; i++) {
        const r = await runOne(client, cfg, mixSeed(seed, `cfg${c}`, i));
        violations.push(...r.violations);
        stats.noGrowChecked += r.noGrow;
        stats.negativesExercised += r.exercised;
        stats.skipped += r.skipped;
        runs++;
      }
    } finally {
      client.close();
    }
  }
  return {runs, iterations, seed, violations, stats};
}

/** Soak variant — generate types continuously for `durationMs`, logging each
 *  violation via `onViolation`. Mirrors runTypeFuzzForDuration. **/
export async function runSizeFuzzForDuration(
  durationMs: number,
  options: SizeFuzzOptions = {},
  onViolation?: (v: SizeViolation) => void,
  now: () => number = () => Date.now()
): Promise<SizeFuzzReport> {
  if (!hasBinary()) throw new Error(`ts-runtypes binary not built: ${BIN}`);
  const seed = options.seed ?? DEFAULT_SEED;
  const violations: SizeViolation[] = [];
  const stats = emptyStats();
  const start = now();
  let runs = 0;
  let round = 0;

  while (now() - start < durationMs) {
    const cfg = SIZE_CONFIGS[round % SIZE_CONFIGS.length];
    const client = openClient(cfg);
    try {
      for (let i = 0; i < 25 && now() - start < durationMs; i++) {
        const r = await runOne(client, cfg, mixSeed(seed, `soak${round}`, i));
        for (const v of r.violations) {
          violations.push(v);
          onViolation?.(v);
        }
        stats.noGrowChecked += r.noGrow;
        stats.negativesExercised += r.exercised;
        stats.skipped += r.skipped;
        runs++;
      }
    } finally {
      client.close();
    }
    round++;
  }
  return {runs, iterations: runs, seed, violations, stats};
}
