/**
 * Seeded runner + soak + prefix-shrinker (worksheet-A §A3/§A5). Dependency-free;
 * adapt from packages/ts-runtypes/test/fuzz/seededRng.ts + fuzzRunner.ts. If
 * fast-check is available, `fc.assert(fc.property(gen, oracle))` replaces this whole
 * file (and shrinks for free) — the oracle layer stays the same.
 */
import type {Violation, CheckCtx} from './oracle-layer.ts';

// --- determinism (A3): one integer seed reproduces any run --------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Swap Math.random for a seeded PRNG for the duration of fn, then restore it. */
export function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/** Derive a stable per-iteration seed from a base seed + a label + an index. */
export function mixSeed(base: number, label: string, index: number): number {
  let hash = base >>> 0;
  for (const char of label) hash = Math.imul(hash ^ char.charCodeAt(0), 0x01000193) >>> 0;
  return Math.imul(hash ^ index, 0x01000193) >>> 0;
}

// --- the loop: generate a value, run every oracle, stop at the first failure ---

export interface FuzzConfig<Value> {
  seed: number;
  runs: number;
  generate: () => Value; // your generator (A2); calls Math.random, which is seeded here
  oracles: Array<(value: Value, ctx: CheckCtx) => Violation | null>;
}

export interface FuzzReport {
  runs: number;
  violations: Violation[];
  firstFailSeed: number | null;
}

export function runFuzz<Value>(config: FuzzConfig<Value>): FuzzReport {
  const violations: Violation[] = [];
  let firstFailSeed: number | null = null;
  let i = 0;
  for (; i < config.runs; i++) {
    const seed = mixSeed(config.seed, 'iter', i);
    const found = withSeededRandom(seed, () => {
      const value = config.generate();
      const ctx: CheckCtx = {seed};
      return config.oracles.map((check) => check(value, ctx)).filter((v): v is Violation => v !== null);
    });
    if (found.length) {
      firstFailSeed = seed;
      violations.push(...found);
      break; // soak mode: remove this break to keep going past the first failure
    }
  }
  return {runs: i + 1, violations, firstFailSeed};
}

/** Soak: run iterations until a wall-clock budget elapses (A5). */
export function runForDuration<Value>(config: Omit<FuzzConfig<Value>, 'runs'>, ms: number): FuzzReport {
  const deadline = Date.now() + ms;
  let i = 0;
  while (Date.now() < deadline) {
    const report = runFuzz({...config, runs: 1, seed: mixSeed(config.seed, 'soak', i++)});
    if (report.violations.length) return {...report, runs: i};
  }
  return {runs: i, violations: [], firstFailSeed: null};
}

/**
 * Shrink to the minimal reproducer (A5). For a single VALUE generator, re-run the
 * failing seed and apply value-shrink (simplify the input while it still fails). For a
 * SEQUENCE generator (model-based.ts), prefix-shrink: the smallest event count that
 * still fails. `stillFails(k)` must be deterministic from the same seed.
 */
export function prefixShrink(stillFails: (maxSteps: number) => boolean, maxSteps: number): number {
  for (let k = 1; k <= maxSteps; k++) if (stillFails(k)) return k;
  return maxSteps;
}
