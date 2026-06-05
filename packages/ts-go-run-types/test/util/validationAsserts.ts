// Shared assertion helpers for the validation adapters. Extracted so
// the atomic/collection adapters (isType / getTypeErrors / mockType)
// and the format adapters (formatIsType / formatMockType) run the exact
// same per-case logic against the `ValidationCase` shape — no
// copy-pasted assertion bodies.

import {expect} from 'vitest';
import type {ValidationCase} from '../suites/validation-suite.ts';

/** Number of values to draw per mock case. Larger = better coverage;
 *  smaller = faster CI. 20 is enough to surface most random-pool drift
 *  bugs without bloating test runtimes. **/
export const MOCK_ITERATIONS = 20;

/** Titles already warned about, so a `valueFirstUnsupported` case logs its
 *  design-flaw notice exactly once across the (isType/getTypeErrors/mock) adapters. **/
const warnedValueFirstUnsupported = new Set<string>();

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : typeof v === 'symbol' ? v.toString() : v));
  } catch {
    return String(value);
  }
}

/** Runs the isType validator in every available form (static, reflect,
 *  deserialize-static, deserialize-reflect) against the case's valid /
 *  invalid samples. **/
export function assertIsType(c: ValidationCase): void {
  if (!c.isType) throw new Error(`case ${c.title}: missing isType thunk`);

  // A case flagged `valueFirstUnsupported` has no value-first builder form because
  // the option it needs is folded into the structural typeId at the createIsType
  // call site. The type-first assertions below still run and pass; we just surface
  // the design flaw once so it stays visible.
  if (c.valueFirstUnsupported && !warnedValueFirstUnsupported.has(c.title)) {
    warnedValueFirstUnsupported.add(c.title);
    console.warn(
      `[value-first-unsupported] case "${c.title}" cannot be authored value-first: the ` +
        `\`${c.valueFirstUnsupported}\` option (and \`noLiterals\`) is folded into the structural ` +
        `typeId at the createIsType call site (internal/resolver/scan.go — noLiterals walks a literal ` +
        `to its base type, noIsArrayCheck wraps the array id with a flag), but value-first builders ` +
        `carry only the TS type via InjectRunTypeId<T>, so options can't ride the value-first surface. ` +
        `DESIGN FLAW to fix: move RunTypeOptions out of the typeId computation so these options become ` +
        `authorable value-first.`
    );
  }

  // factoryThrows — the Go pipeline rendered the runtype's factory as
  // alwaysThrow (root-unsupported kinds like `symbol`). Every variant
  // throws on invocation; nothing further to validate.
  if (c.factoryThrows) {
    expect(() => c.isType!(), `${c.title} [static]: factory must throw`).toThrow();
    if (c.isTypeReflect) expect(() => c.isTypeReflect(), `${c.title} [reflect]: factory must throw`).toThrow();
    if (c.deserializeIsType)
      expect(() => c.deserializeIsType!(), `${c.title} [deserialize-static]: factory must throw`).toThrow();
    if (c.deserializeIsTypeReflect)
      expect(() => c.deserializeIsTypeReflect!(), `${c.title} [deserialize-reflect]: factory must throw`).toThrow();
    return;
  }

  const {valid, invalid} = c.getSamples();

  // Static form: createIsType<T>().
  const isTypeStatic = c.isType();
  valid.forEach((v, i) => {
    expect(isTypeStatic(v), `${c.title} [static]: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(isTypeStatic(v), `${c.title} [static]: invalid[${i}] should fail`).toBe(false);
  });

  // Reflect form: createIsType(value). Optional — cases that omit
  // `isTypeReflect` (typically because of a documented divergence with
  // the static form) skip the second pass.
  if (c.isTypeReflect) {
    const isTypeReflect = c.isTypeReflect();
    valid.forEach((v, i) => {
      expect(isTypeReflect(v), `${c.title} [reflect]: valid[${i}] should pass`).toBe(true);
    });
    invalid.forEach((v, i) => {
      expect(isTypeReflect(v), `${c.title} [reflect]: invalid[${i}] should fail`).toBe(false);
    });
  }

  // Deserialize-static form: deserializeIsType<T>() rebuilds the
  // validator from the serialized RTCompiledFnData.code body via
  // `new Function('utl', code)(rtUtils)` — verifies that the
  // over-the-wire round-trip produces an equivalent validator.
  if (c.deserializeIsType) {
    const deserializedStatic = c.deserializeIsType();
    valid.forEach((v, i) => {
      expect(deserializedStatic(v), `${c.title} [deserialize-static]: valid[${i}] should pass`).toBe(true);
    });
    invalid.forEach((v, i) => {
      expect(deserializedStatic(v), `${c.title} [deserialize-static]: invalid[${i}] should fail`).toBe(false);
    });
  }

  // Deserialize-reflect form: same as above but T inferred from a
  // runtime value's declared type.
  if (c.deserializeIsTypeReflect) {
    const deserializedReflect = c.deserializeIsTypeReflect();
    valid.forEach((v, i) => {
      expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: valid[${i}] should pass`).toBe(true);
    });
    invalid.forEach((v, i) => {
      expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: invalid[${i}] should fail`).toBe(false);
    });
  }

  // Schema form: createIsTypeFor(<value-first builder schema>). Optional —
  // present only on leaf-buildable cases. Proves the value-first authoring path
  // resolves a validator that agrees with the type-first surface on the same
  // samples (the builder reflects the same leaf type → same precompiled factory).
  if (c.isTypeSchema) {
    const isTypeSchema = c.isTypeSchema();
    valid.forEach((v, i) => {
      expect(isTypeSchema(v), `${c.title} [schema]: valid[${i}] should pass`).toBe(true);
    });
    invalid.forEach((v, i) => {
      expect(isTypeSchema(v), `${c.title} [schema]: invalid[${i}] should fail`).toBe(false);
    });
  }
}

/** Runs the getTypeErrors validator in every available form and asserts
 *  each invalid sample produces the index-parallel `getExpectedErrors`
 *  entry (exact deep-equal), valid samples produce `[]`. **/
export function assertGetTypeErrors(c: ValidationCase): void {
  if (!c.getTypeErrors) throw new Error(`case ${c.title}: missing getTypeErrors thunk`);

  // factoryThrows — alwaysThrow factory; every variant throws on
  // invocation. getExpectedErrors / samples are not consulted.
  if (c.factoryThrows) {
    expect(() => c.getTypeErrors!(), `${c.title} [static]: factory must throw`).toThrow();
    if (c.getTypeErrorsReflect) expect(() => c.getTypeErrorsReflect(), `${c.title} [reflect]: factory must throw`).toThrow();
    if (c.deserializeGetTypeErrors)
      expect(() => c.deserializeGetTypeErrors!(), `${c.title} [deserialize-static]: factory must throw`).toThrow();
    if (c.deserializeGetTypeErrorsReflect)
      expect(() => c.deserializeGetTypeErrorsReflect!(), `${c.title} [deserialize-reflect]: factory must throw`).toThrow();
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

  // Static form: createGetTypeErrors<T>().
  const getErrStatic = c.getTypeErrors();
  valid.forEach((v, i) => {
    expect(getErrStatic(v), `${c.title} [static]: valid[${i}] → no errors`).toEqual([]);
  });
  invalid.forEach((v, i) => {
    expect(getErrStatic(v), `${c.title} [static]: invalid[${i}]`).toEqual(expected[i]);
  });

  // Reflect form: createGetTypeErrors(value). Optional.
  if (c.getTypeErrorsReflect) {
    const getErrReflect = c.getTypeErrorsReflect();
    valid.forEach((v, i) => {
      expect(getErrReflect(v), `${c.title} [reflect]: valid[${i}] → no errors`).toEqual([]);
    });
    invalid.forEach((v, i) => {
      expect(getErrReflect(v), `${c.title} [reflect]: invalid[${i}]`).toEqual(expected[i]);
    });
  }

  // Deserialize-static form: deserializeGetTypeErrors<T>().
  if (c.deserializeGetTypeErrors) {
    const deserializedStatic = c.deserializeGetTypeErrors();
    valid.forEach((v, i) => {
      expect(deserializedStatic(v), `${c.title} [deserialize-static]: valid[${i}] → no errors`).toEqual([]);
    });
    invalid.forEach((v, i) => {
      expect(deserializedStatic(v), `${c.title} [deserialize-static]: invalid[${i}]`).toEqual(expected[i]);
    });
  }

  // Deserialize-reflect form: deserializeGetTypeErrors(value).
  if (c.deserializeGetTypeErrorsReflect) {
    const deserializedReflect = c.deserializeGetTypeErrorsReflect();
    valid.forEach((v, i) => {
      expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: valid[${i}] → no errors`).toEqual([]);
    });
    invalid.forEach((v, i) => {
      expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: invalid[${i}]`).toEqual(expected[i]);
    });
  }

  // Schema form: createTypeErrorsFor(<value-first builder schema>). Optional.
  // A value-first leaf builder reflects the FORMAT of a type (e.g. `string()` →
  // `FormatString<{}>`), so its error detail may carry format metadata the bare
  // type-first error doesn't — we therefore assert the CONTRACT (valid → no
  // errors; invalid → at least one error) rather than deep-equality with the
  // type-first `expected`, which the static pass above already pins exactly.
  if (c.getTypeErrorsSchema) {
    const getErrSchema = c.getTypeErrorsSchema();
    valid.forEach((v, i) => {
      expect(getErrSchema(v), `${c.title} [schema]: valid[${i}] → no errors`).toEqual([]);
    });
    invalid.forEach((v, i) => {
      expect(getErrSchema(v).length, `${c.title} [schema]: invalid[${i}] → at least one error`).toBeGreaterThan(0);
    });
  }
}

/** Draws MOCK_ITERATIONS values from the mock generator (static +
 *  reflect forms) and asserts each passes the paired `isType<T>()`,
 *  honoring the `mockTypeExpect` / `factoryThrows` discriminators. **/
export function assertMockType(c: ValidationCase): void {
  if (!c.mockType) throw new Error(`case ${c.title}: missing mockType thunk`);

  // factoryThrows — the isType / getTypeErrors factories are
  // alwaysThrow for this kind (root-unsupported), but the mock walker
  // doesn't go through the RT cache. It still produces a value (a
  // mocked symbol, function, etc.); we just can't isType-check it
  // since the paired validator throws on construction. Run the mock
  // fn so we still verify no error escapes the generator, then bail.
  const expectMode = c.factoryThrows ? 'skip' : (c.mockTypeExpect ?? 'value');

  if (expectMode === 'throw') {
    const mockFn = c.mockType();
    expect(() => mockFn(), `${c.title} [static]: mock fn should throw`).toThrow();
    if (c.mockTypeReflect) {
      const mockFnReflect = c.mockTypeReflect();
      expect(() => mockFnReflect(), `${c.title} [reflect]: mock fn should throw`).toThrow();
    }
    return;
  }

  if (expectMode !== 'skip' && !c.isType) {
    throw new Error(`case ${c.title}: mockType needs paired isType thunk to validate`);
  }

  const runPass = (mockFn: () => unknown, label: string): void => {
    // expectMode === 'skip' means we exercise the mock generator but
    // can't validate output — either because the kind has no isType
    // semantic (functions) or because the paired isType factory is
    // alwaysThrow (root symbol). Either way, skip the isType call so
    // it doesn't blow up the test.
    if (expectMode === 'skip') {
      for (let i = 0; i < MOCK_ITERATIONS; i++) mockFn();
      return;
    }
    const isValid = c.isType!();
    for (let i = 0; i < MOCK_ITERATIONS; i++) {
      const generated = mockFn();
      const ok = isValid(generated);
      if (!ok) {
        throw new Error(
          `${c.title} [${label}]: iteration ${i} — generated value did not pass isType. value=${safeStringify(generated)}`
        );
      }
    }
  };

  runPass(c.mockType(), 'static');
  if (c.mockTypeReflect) runPass(c.mockTypeReflect(), 'reflect');
}
