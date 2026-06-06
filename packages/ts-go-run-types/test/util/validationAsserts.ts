// Per-variant assertion helpers for the validation adapters. Each helper
// exercises EXACTLY ONE thunk on a ValidationCase (one cell of the
// family × form matrix), so the validation/* and format-validation/*
// suites can register one it() per variant — a failing test name
// (`<title> — isType/deserialize-reflect`) pinpoints which form broke,
// and other forms in the same case keep running instead of being
// short-circuited by the first failing expect().
//
// A thunk field on a case can be in three states; titleFor() surfaces
// the state in the it() name so the test tree is self-documenting:
//   - function           → no suffix; assert runs the function
//   - undefined          → " (not implemented)"; assert silently early-returns
//   - 'not-supported'    → " (not supported)";   assert silently early-returns

import {expect} from 'vitest';
import type {Thunk, ValidationCase} from '../suites/validation/types.ts';
import type {FormatValidationCase} from '../suites/format-validation/types.ts';

/** Number of values to draw per mock case. Larger = better coverage;
 *  smaller = faster CI. 20 is enough to surface most random-pool drift
 *  bugs without bloating test runtimes. **/
export const MOCK_ITERATIONS = 20;

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : typeof v === 'symbol' ? v.toString() : v));
  } catch {
    return String(value);
  }
}

/** Resolves a thunk field to its callable form, or `undefined` if the case
 *  doesn't declare a working thunk (either omitted entirely or marked
 *  `'not-supported'`). Use at the top of every per-variant assert to skip
 *  both gaps with a single check. **/
function resolveThunk<T>(thunk: Thunk<T> | undefined): (() => T) | undefined {
  if (!thunk || thunk === 'not-supported') return undefined;
  return thunk;
}

/** The (family, form) coordinates that actually exist on a ValidationCase.
 *  Invalid combos like 'isType/format' or 'mockType/schema' are not in the
 *  union — passing one is a TS error at the test-file call site. **/
export type VariantKey =
  | `isType/${'static' | 'reflect' | 'deserialize-static' | 'deserialize-reflect' | 'schema'}`
  | `getTypeErrors/${'static' | 'reflect' | 'deserialize-static' | 'deserialize-reflect' | 'schema' | 'format'}`
  | `mockType/${'static' | 'reflect'}`;

/** Resolves a variant key to the case's matching thunk field (function,
 *  `'not-supported'`, or `undefined`). 'getTypeErrors/format' points at the
 *  same static thunk as 'getTypeErrors/static' but is asserted with
 *  format-payload semantics by the format-validation suites. **/
function thunkFor(c: ValidationCase, key: VariantKey): Thunk<unknown> | undefined {
  switch (key) {
    case 'isType/static':
      return c.isType;
    case 'isType/reflect':
      return c.isTypeReflect;
    case 'isType/deserialize-static':
      return c.deserializeIsType;
    case 'isType/deserialize-reflect':
      return c.deserializeIsTypeReflect;
    case 'isType/schema':
      return c.isTypeSchema;
    case 'getTypeErrors/static':
      return c.getTypeErrors;
    case 'getTypeErrors/reflect':
      return c.getTypeErrorsReflect;
    case 'getTypeErrors/deserialize-static':
      return c.deserializeGetTypeErrors;
    case 'getTypeErrors/deserialize-reflect':
      return c.deserializeGetTypeErrorsReflect;
    case 'getTypeErrors/schema':
      return c.getTypeErrorsSchema;
    case 'getTypeErrors/format':
      return c.getTypeErrors;
    case 'mockType/static':
      return c.mockType;
    case 'mockType/reflect':
      return c.mockTypeReflect;
  }
}

/** Build the it() title for one variant. The key is used directly as the
 *  suffix (`<case title> — <family>/<form>`), with a state marker appended
 *  when the case's thunk is missing or marked as a known limitation:
 *   - function          → no suffix
 *   - `'not-supported'` → " (not supported)"
 *   - undefined         → " (not implemented)"
 *  Both gap markers surface in the test tree without anyone having to read
 *  the test body. **/
export function titleFor(c: ValidationCase, key: VariantKey): string {
  const value = thunkFor(c, key);
  const base = `${c.title} — ${key}`;
  if (value === 'not-supported') return `${base} (not supported)`;
  if (!value) return `${base} (not implemented)`;
  return base;
}

// =========================================================================
// isType family — 5 variants
// =========================================================================

/** Static form: createIsType<T>(). **/
export function assertIsTypeStatic(c: ValidationCase): void {
  const factory = resolveThunk(c.isType);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [static]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const isTypeStatic = factory();
  valid.forEach((v, i) => {
    expect(isTypeStatic(v), `${c.title} [static]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(isTypeStatic(v), `${c.title} [static]: invalid[${i}] should fail`).toBe(false);
  });
}

/** Reflect form: createIsType(value). T inferred from a runtime value's
 *  declared type; the value itself is discarded at runtime. **/
export function assertIsTypeReflect(c: ValidationCase): void {
  const factory = resolveThunk(c.isTypeReflect);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [reflect]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const isTypeReflect = factory();
  valid.forEach((v, i) => {
    expect(isTypeReflect(v), `${c.title} [reflect]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(isTypeReflect(v), `${c.title} [reflect]: invalid[${i}] should fail`).toBe(false);
  });
}

/** Deserialize-static form: validator rebuilt from the serialized
 *  RTCompiledFnData.code body via `new Function('utl', code)(rtUtils)`. **/
export function assertIsTypeDeserializeStatic(c: ValidationCase): void {
  const factory = resolveThunk(c.deserializeIsType);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [deserialize-static]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const deserializedStatic = factory();
  valid.forEach((v, i) => {
    expect(deserializedStatic(v), `${c.title} [deserialize-static]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(deserializedStatic(v), `${c.title} [deserialize-static]: invalid[${i}] should fail`).toBe(false);
  });
}

/** Deserialize-reflect form: same as deserialize-static but T inferred
 *  from a runtime value's declared type. **/
export function assertIsTypeDeserializeReflect(c: ValidationCase): void {
  const factory = resolveThunk(c.deserializeIsTypeReflect);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [deserialize-reflect]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const deserializedReflect = factory();
  valid.forEach((v, i) => {
    expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: invalid[${i}] should fail`).toBe(false);
  });
}

/** Backwards-compat shim used by the value-first-define suite, which is
 *  not restructured into per-variant it()s. Runs all 5 isType variants
 *  in sequence so the single it() in that suite exercises the same matrix
 *  the validation suite splits across five it()s. **/
export function assertIsType(c: ValidationCase): void {
  assertIsTypeStatic(c);
  assertIsTypeReflect(c);
  assertIsTypeDeserializeStatic(c);
  assertIsTypeDeserializeReflect(c);
  assertIsTypeSchema(c);
}

/** Schema form: createIsType(<value-first builder schema>). Proves the
 *  value-first authoring path resolves a validator that agrees with the
 *  type-first surface on the same samples. **/
export function assertIsTypeSchema(c: ValidationCase): void {
  const factory = resolveThunk(c.isTypeSchema);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [schema]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const isTypeSchema = factory();
  valid.forEach((v, i) => {
    expect(isTypeSchema(v), `${c.title} [schema]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(isTypeSchema(v), `${c.title} [schema]: invalid[${i}] should fail`).toBe(false);
  });
}

// =========================================================================
// getTypeErrors family — 5 variants
// =========================================================================

/** Static form: createGetTypeErrors<T>(). **/
export function assertGetTypeErrorsStatic(c: ValidationCase): void {
  const factory = resolveThunk(c.getTypeErrors);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [static]: factory must throw`).toThrow();
    return;
  }
  if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const expected = c.getExpectedErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }
  const getErrStatic = factory();
  valid.forEach((v, i) => {
    expect(getErrStatic(v), `${c.title} [static]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErrStatic(v), `${c.title} [static]: invalid[${i}]`).toEqual(expected[i]);
  });
}

/** Reflect form: createGetTypeErrors(value). **/
export function assertGetTypeErrorsReflect(c: ValidationCase): void {
  const factory = resolveThunk(c.getTypeErrorsReflect);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [reflect]: factory must throw`).toThrow();
    return;
  }
  if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const expected = c.getExpectedErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }
  const getErrReflect = factory();
  valid.forEach((v, i) => {
    expect(getErrReflect(v), `${c.title} [reflect]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErrReflect(v), `${c.title} [reflect]: invalid[${i}]`).toEqual(expected[i]);
  });
}

/** Deserialize-static form: validator rebuilt from RTCompiledFnData.code. **/
export function assertGetTypeErrorsDeserializeStatic(c: ValidationCase): void {
  const factory = resolveThunk(c.deserializeGetTypeErrors);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [deserialize-static]: factory must throw`).toThrow();
    return;
  }
  if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const expected = c.getExpectedErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }
  const deserializedStatic = factory();
  valid.forEach((v, i) => {
    expect(deserializedStatic(v), `${c.title} [deserialize-static]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(deserializedStatic(v), `${c.title} [deserialize-static]: invalid[${i}]`).toEqual(expected[i]);
  });
}

/** Deserialize-reflect form. **/
export function assertGetTypeErrorsDeserializeReflect(c: ValidationCase): void {
  const factory = resolveThunk(c.deserializeGetTypeErrorsReflect);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [deserialize-reflect]: factory must throw`).toThrow();
    return;
  }
  if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const expected = c.getExpectedErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }
  const deserializedReflect = factory();
  valid.forEach((v, i) => {
    expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: invalid[${i}]`).toEqual(expected[i]);
  });
}

/** Schema form: createGetTypeErrors(<value-first builder schema>).
 *  A value-first leaf builder reflects the FORMAT of a type (e.g. `string()`
 *  → `FormatString<{}>`), so its error detail may carry format metadata the
 *  bare type-first error doesn't — we therefore assert the CONTRACT
 *  (valid → no errors; invalid → at least one error) rather than deep-equality
 *  with the type-first `expected`, which the static pass above already pins. **/
export function assertGetTypeErrorsSchema(c: ValidationCase): void {
  const factory = resolveThunk(c.getTypeErrorsSchema);
  if (!factory) return;
  if (c.factoryThrows) {
    expect(() => factory(), `${c.title} [schema]: factory must throw`).toThrow();
    return;
  }
  const {valid, invalid} = c.getSamples();
  const getErrSchema = factory();
  valid.forEach((v, i) => {
    expect(getErrSchema(v), `${c.title} [schema]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErrSchema(v).length, `${c.title} [schema]: invalid[${i}] → at least one error`).toBeGreaterThan(0);
  });
}

// =========================================================================
// mockType family — 2 variants
// =========================================================================

/** Drives one mock fn for MOCK_ITERATIONS iterations and asserts each
 *  generated value passes the case's static isType. **/
function runMockPass(c: ValidationCase, mockFn: () => unknown, label: string): void {
  // expectMode === 'skip' means we exercise the mock generator but can't
  // validate output — either because the kind has no isType semantic
  // (functions) or because the paired isType factory is alwaysThrow
  // (root symbol). Either way, skip the isType call so it doesn't blow up.
  const expectMode = c.factoryThrows ? 'skip' : (c.mockTypeExpect ?? 'value');
  if (expectMode === 'skip') {
    for (let i = 0; i < MOCK_ITERATIONS; i++) mockFn();
    return;
  }
  const isTypeFactory = resolveThunk(c.isType);
  if (!isTypeFactory) {
    throw new Error(`case ${c.title}: mockType needs paired isType thunk to validate`);
  }
  const isValid = isTypeFactory();
  for (let i = 0; i < MOCK_ITERATIONS; i++) {
    const generated = mockFn();
    const ok = isValid(generated);
    if (!ok) {
      throw new Error(
        `${c.title} [${label}]: iteration ${i} — generated value did not pass isType. value=${safeStringify(generated)}`
      );
    }
  }
}

/** Static form: createMockType<T>(). **/
export function assertMockTypeStatic(c: ValidationCase): void {
  const factory = resolveThunk(c.mockType);
  if (!factory) return;
  const expectMode = c.factoryThrows ? 'skip' : (c.mockTypeExpect ?? 'value');
  if (expectMode === 'throw') {
    const mockFn = factory();
    expect(() => mockFn(), `${c.title} [static]: mock fn should throw`).toThrow();
    return;
  }
  runMockPass(c, factory(), 'static');
}

/** Reflect form: createMockType(value). **/
export function assertMockTypeReflect(c: ValidationCase): void {
  const factory = resolveThunk(c.mockTypeReflect);
  if (!factory) return;
  const expectMode = c.factoryThrows ? 'skip' : (c.mockTypeExpect ?? 'value');
  if (expectMode === 'throw') {
    const mockFn = factory();
    expect(() => mockFn(), `${c.title} [reflect]: mock fn should throw`).toThrow();
    return;
  }
  runMockPass(c, factory(), 'reflect');
}

// =========================================================================
// format-validation getTypeErrors — single variant (static, format payload)
// =========================================================================

/** Format getTypeErrors — asserts valid samples produce no errors and each
 *  invalid sample carries the expected `format` payload (name, optional `val`,
 *  optional `formatPath` tail) via the case's index-parallel
 *  `expectedFormatErrors`. Matches on the format payload, not a full
 *  RunTypeError deep-equal — robust against incidental fields in the envelope. **/
export function assertFormatGetTypeErrorsStatic(c: FormatValidationCase): void {
  const factory = resolveThunk(c.getTypeErrors);
  if (!factory) return;
  if (!c.expectedFormatErrors) throw new Error(`case ${c.title}: missing expectedFormatErrors thunk`);

  const {valid, invalid} = c.getSamples();
  const expected = c.expectedFormatErrors();
  if (expected.length !== invalid.length) {
    throw new Error(
      `case ${c.title}: expectedFormatErrors length (${expected.length}) must match invalid samples (${invalid.length})`
    );
  }

  const getErr = factory();

  valid.forEach((v, i) => {
    expect(getErr(v), `${c.title}: valid[${i}] → no errors`).toEqual([]);
  });

  invalid.forEach((v, i) => {
    const errors = getErr(v);
    expect(errors.length, `${c.title}: invalid[${i}] should produce at least one error`).toBeGreaterThan(0);

    const exp = expected[i];
    if (!exp) return;

    const formatErr = errors.find((entry) => entry.format?.name === exp.name)?.format;
    expect(formatErr, `${c.title}: invalid[${i}] should carry a '${exp.name}' format error`).toBeDefined();

    if (exp.val !== undefined) {
      expect(formatErr?.val, `${c.title}: invalid[${i}] format.val`).toEqual(exp.val);
    }
    if (exp.formatPathTail !== undefined) {
      const path = formatErr?.formatPath;
      expect(path?.[path.length - 1], `${c.title}: invalid[${i}] format.formatPath tail`).toBe(exp.formatPathTail);
    }
  });
}

// =========================================================================
// value-first-suite contract helper (kept as-is, consumed elsewhere)
// =========================================================================

/** Lightweight getTypeErrors contract used by the value-first suite: valid
 *  samples produce no errors, invalid samples produce at least one. A value-first
 *  leaf builder reflects the FORMAT of a type, so its error detail may carry
 *  metadata the bare type-first error doesn't — assert the contract, not a
 *  deep-equal against an expected-errors table (the validation suite pins those). **/
export function assertGetTypeErrorsContract(c: ValidationCase): void {
  const factory = resolveThunk(c.getTypeErrors);
  if (!factory) throw new Error(`case ${c.title}: missing getTypeErrors thunk`);
  const {valid, invalid} = c.getSamples();
  const getErr = factory();
  valid.forEach((v, i) => {
    expect(getErr(v), `${c.title} [getTypeErrors]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErr(v).length, `${c.title} [getTypeErrors]: invalid[${i}] → ≥1 error`).toBeGreaterThan(0);
  });
}
