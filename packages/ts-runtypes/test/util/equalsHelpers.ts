// Ported verbatim from the reference
// packages/run-types/src/rtCompilers/equalsHelpers.ts. Used by the
// prepareForJson + restoreFromJson adapter tests to normalise both sides
// of a round-trip comparison before invoking `expect(...).toEqual(...)`.
//
// Two cases motivate this helper:
//
//   1. Class instances vs plain objects — a class instance round-tripped
//      through JSON.stringify + JSON.parse becomes a plain object whose
//      prototype is `Object.prototype`, not the original class. Vitest's
//      `toEqual` distinguishes the two by prototype, even though their
//      enumerable contents match. This helper walks both sides and
//      rebuilds them as plain objects so the prototype mismatch
//      disappears.
//
//   2. Vitest's stricter array comparison vs Jest's:
//        Jest:   [446] equals [446, undefined, undefined, undefined] // true
//        Vitest: [446] equals [446, undefined, undefined, undefined] // false
//      This helper pads the shorter array with undefined values so both
//      sides have the same length, then recurses into each slot.

/** Recursively normalize actual + expected for `toEqual`. Returns
 *  new plain-object / plain-array structures so prototype mismatches
 *  between class instances and round-tripped JSON disappear; arrays
 *  are padded to the longer side's length so trailing optional
 *  elements compare cleanly. Symbols are reduced to a tagged
 *  description object so two distinct `Symbol(x)` values compare equal
 *  via toEqual (round-trip through JSON destroys symbol identity by
 *  design — only the description survives).
 *
 *  Function-valued properties are stripped from BOTH sides before
 *  comparison. Functions are intrinsically non-JSON-encodable
 *  (`JSON.stringify(fn) === undefined` at root; functions inside
 *  objects are silently dropped). Comparing against the original
 *  unmutated reference would always fail for sample shapes like
 *  `{name: 'x', cb: () => null}` — the round-trip leaves the function
 *  out, the reference still has it. Stripping it on both sides gives
 *  the honest "did the non-function shape survive?" comparison. **/
export function normalizeForComparison(actual: any, expected: any): {actual: any; expected: any} {
  // Handle symbols — different Symbol instances with the same description
  // are NOT equal under Vitest's toEqual. Round-tripping a symbol through
  // prepareForJson/JSON.parse/restoreFromJson produces a brand-new
  // symbol; compare by description instead.
  if (typeof actual === 'symbol' || typeof expected === 'symbol') {
    return {
      actual: typeof actual === 'symbol' ? {__symDesc: actual.description ?? ''} : actual,
      expected: typeof expected === 'symbol' ? {__symDesc: expected.description ?? ''} : expected,
    };
  }
  // Temporal instances have no enumerable own keys (data lives in internal
  // slots / prototype getters), so the object branch below would reduce both
  // sides to `{}` and pass trivially. Compare by canonical string instead,
  // mirroring the symbol-by-description handling above.
  if (isTemporalInstance(actual) || isTemporalInstance(expected)) {
    return {
      actual: isTemporalInstance(actual) ? {__temporal: actual.toString()} : actual,
      expected: isTemporalInstance(expected) ? {__temporal: expected.toString()} : expected,
    };
  }
  // Handle arrays — normalize length to match the longer side.
  if (Array.isArray(actual) && Array.isArray(expected)) {
    const maxLength = Math.max(actual.length, expected.length);
    const normalizedActual = normalizeArrayForComparison(actual, maxLength);
    const normalizedExpected = normalizeArrayForComparison(expected, maxLength);
    const resultActual: any[] = [];
    const resultExpected: any[] = [];
    for (let i = 0; i < maxLength; i++) {
      const normalized = normalizeForComparison(normalizedActual[i], normalizedExpected[i]);
      resultActual.push(normalized.actual);
      resultExpected.push(normalized.expected);
    }
    return {actual: resultActual, expected: resultExpected};
  }
  // Handle nested objects. Function-valued keys (from either side) are
  // filtered out — functions can't JSON-serialize and serializer emits
  // already skip them, so the only way to compare honestly is to drop
  // them on the reference side too.
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const actualKeys = Object.keys(actual).filter((k) => typeof actual[k] !== 'function');
    const expectedKeys = Object.keys(expected).filter((k) => typeof expected[k] !== 'function');
    const allKeys = [...new Set([...actualKeys, ...expectedKeys])];
    const resultActual: any = {};
    const resultExpected: any = {};
    for (const key of allKeys) {
      const normalized = normalizeForComparison(actual[key], expected[key]);
      resultActual[key] = normalized.actual;
      resultExpected[key] = normalized.expected;
    }
    return {actual: resultActual, expected: resultExpected};
  }
  // Primitive values — return as-is.
  return {actual, expected};
}

/** Pads `arr` with `undefined` up to `targetLength`. Mirrors
 *  the `normalizeArrayForComparison`. **/
function normalizeArrayForComparison(arr: any[], targetLength: number): any[] {
  if (arr.length >= targetLength) return arr;
  return [...arr, ...Array(targetLength - arr.length).fill(undefined)];
}

/** Deep clone for round-trip test inputs. The serializer mutates `v`
 *  in place; without a fresh copy the comparison-side reference would
 *  see the post-mutation shape, masking real correctness issues.
 *
 *  Handles Date, RegExp, Map, Set, primitives, and arrays/objects
 *  recursively. Symbols pass through (immutable, no risk of
 *  cross-mutation). Functions and Promises pass through unchanged —
 *  those aren't meaningfully cloneable and round-trip tests for them
 *  are gated by `getRoundTripValid` overrides anyway. **/
export function deepCloneForRoundTrip(value: any): any {
  if (value === null || value === undefined) return value;
  const t = typeof value;
  if (t === 'symbol' || t === 'function') return value;
  if (t !== 'object') return value;
  // Temporal instances are immutable (no enumerable own keys); the generic
  // object clone at the bottom would flatten them to `{}` and lose the value
  // before the encoder sees them. Pass through unchanged, like symbols above.
  if (isTemporalInstance(value)) return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof RegExp) return new RegExp(value.source, value.flags);
  if (value instanceof Map) {
    const out = new Map();
    for (const [k, v] of value.entries()) out.set(deepCloneForRoundTrip(k), deepCloneForRoundTrip(v));
    return out;
  }
  if (value instanceof Set) {
    const out = new Set();
    for (const v of value.values()) out.add(deepCloneForRoundTrip(v));
    return out;
  }
  if (Array.isArray(value)) return value.map(deepCloneForRoundTrip);
  const out: any = {};
  for (const key of Object.keys(value)) out[key] = deepCloneForRoundTrip(value[key]);
  return out;
}

/** True for a TC39 `Temporal.*` instance. Detected via the well-known
 *  `Symbol.toStringTag` (e.g. 'Temporal.PlainDate') so it covers all eight
 *  types without importing the Temporal lib or enumerating them. **/
export function isTemporalInstance(value: any): boolean {
  if (value === null || typeof value !== 'object') return false;
  const tag = (value as {[Symbol.toStringTag]?: unknown})[Symbol.toStringTag];
  return typeof tag === 'string' && tag.startsWith('Temporal.');
}
