// Ported verbatim from
// mion/packages/run-types/src/jitCompilers/equalsHelpers.ts. Used by the
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
 *  design — only the description survives). **/
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
  // Handle nested objects.
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const actualKeys = Object.keys(actual);
    const expectedKeys = Object.keys(expected);
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
 *  mion's `normalizeArrayForComparison`. **/
function normalizeArrayForComparison(arr: any[], targetLength: number): any[] {
  if (arr.length >= targetLength) return arr;
  return [...arr, ...Array(targetLength - arr.length).fill(undefined)];
}
