// Deterministic RNG for reproducible fuzzing.
//
// The mock walker (mocking/mockUtils.ts) and the invalid-value generator
// both draw entropy from the global `Math.random`. To make a fuzz run
// reproducible we don't thread a generator through every call site —
// instead `withSeededRandom` swaps `Math.random` for a seeded PRNG for the
// duration of one closure and restores it afterwards. A failing case logs
// its seed; re-running `withSeededRandom(seed, …)` replays it byte-for-byte.

/** mulberry32 — a tiny, fast, well-distributed 32-bit PRNG. Returns a
 *  function yielding floats in [0, 1), same contract as `Math.random`. **/
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Run `fn` with `Math.random` replaced by a seeded PRNG, then restore the
 *  original. Reproducible: same seed ⇒ same draws ⇒ same generated data. **/
export function withSeededRandom<T>(seed: number, fn: () => T): T {
  const original = Math.random;
  Math.random = mulberry32(seed);
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

/** Fold a string into a 32-bit hash (FNV-1a). Used to derive a stable
 *  per-target seed offset so two targets never share a draw sequence. **/
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mix a base seed, a target label, and an iteration index into one uint32
 *  seed. Deterministic and collision-resistant enough for replay. **/
export function mixSeed(baseSeed: number, label: string, iteration: number): number {
  let mixed = (baseSeed >>> 0) ^ hashString(label);
  mixed = Math.imul(mixed ^ iteration, 0x9e3779b1);
  return (mixed ^ (mixed >>> 16)) >>> 0;
}
