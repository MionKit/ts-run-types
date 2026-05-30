// End-to-end proof that the value-first COMPOSER + reflection builders lower to
// the same precompiled RunType graph the type-first surface produces. Each
// builder is fed to `createIsTypeFor` (schema form) and asserted against
// valid/invalid samples; convergence is asserted with `.toBe` against the
// equivalent `createIsType<T>()` (same structural id ⇒ same cached factory).
//
// Convergence cases deliberately use `boolean` / object-of-boolean / literals —
// kinds with NO format brand — so the value-first id equals the bare type-first
// id. (A `string()` builder carries `FormatString<{}>`, which converges with
// `FormatString<{}>`, not the bare `string`; behaviour is identical either way.)
//
// Per the CLAUDE.md marker-coverage rule the universal reflectors are covered in
// BOTH forms — static `runType<T>()` and reflection `reflectRunType(value)` —
// with a hash-equivalence assertion that both resolve to the same factory.

import {describe, expect, it} from 'vitest';
import {createIsType, createIsTypeFor, createTypeErrorsFor} from '@mionjs/ts-go-run-types';
import {array, tuple, union, intersection, record, object, string, number, boolean, literal, regexp, runType, reflectRunType} from '@mionjs/ts-go-run-types/define';
import '@mionjs/ts-go-run-types/formats';

describe('compose builders — array', () => {
  it('validates and converges with the type-first array', () => {
    const isBoolArr = createIsTypeFor(array(boolean()));
    expect(isBoolArr([true, false])).toBe(true);
    expect(isBoolArr([])).toBe(true);
    expect(isBoolArr([true, 1])).toBe(false);
    expect(isBoolArr('nope')).toBe(false);
    // convergence: array(boolean()) ⇒ boolean[]
    expect(isBoolArr).toBe(createIsType<boolean[]>());
  });

  it('validates a string-format element array', () => {
    const isStrArr = createIsTypeFor(array(string()));
    expect(isStrArr(['a', 'b'])).toBe(true);
    expect(isStrArr([1])).toBe(false);
  });
});

describe('compose builders — tuple', () => {
  it('validates a fixed [string, number] tuple', () => {
    const isPair = createIsTypeFor(tuple([string(), number()]));
    expect(isPair(['a', 1])).toBe(true);
    expect(isPair(['a', 'b'])).toBe(false);
    expect(isPair(['a'])).toBe(false);
    expect(isPair(['a', 1, 2])).toBe(false);
  });

  it('converges with the type-first tuple (boolean elements)', () => {
    expect(createIsTypeFor(tuple([boolean(), boolean()]))).toBe(createIsType<[boolean, boolean]>());
  });
});

describe('compose builders — union', () => {
  it('validates and converges with the type-first union', () => {
    const isBoolOrLit = createIsTypeFor(union([boolean(), literal('x')]));
    expect(isBoolOrLit(true)).toBe(true);
    expect(isBoolOrLit('x')).toBe(true);
    expect(isBoolOrLit('y')).toBe(false);
    expect(isBoolOrLit(1)).toBe(false);
    // convergence: union([boolean(), literal('x')]) ⇒ boolean | 'x'
    expect(isBoolOrLit).toBe(createIsType<boolean | 'x'>());
  });

  it('validates a discriminated union of objects', () => {
    const isShape = createIsTypeFor(
      union([object({kind: literal('a'), n: number()}), object({kind: literal('b'), s: string()})])
    );
    expect(isShape({kind: 'a', n: 1})).toBe(true);
    expect(isShape({kind: 'b', s: 'hi'})).toBe(true);
    expect(isShape({kind: 'a', s: 'hi'})).toBe(false);
  });
});

describe('compose builders — intersection', () => {
  it('validates the merged object and converges', () => {
    const isMerged = createIsTypeFor(intersection(object({a: boolean()}), object({b: boolean()})));
    expect(isMerged({a: true, b: false})).toBe(true);
    expect(isMerged({a: true})).toBe(false);
    expect(isMerged({b: false})).toBe(false);
    // intersection collapses to the merged object {a: boolean; b: boolean}
    expect(isMerged).toBe(createIsType<{a: boolean; b: boolean}>());
  });
});

describe('compose builders — record', () => {
  it('validates a string-index record and converges', () => {
    const isRec = createIsTypeFor(record(boolean()));
    expect(isRec({x: true, y: false})).toBe(true);
    expect(isRec({})).toBe(true);
    expect(isRec({x: 1})).toBe(false);
    expect(isRec(null)).toBe(false);
    expect(isRec).toBe(createIsType<Record<string, boolean>>());
  });
});

describe('compose builders — object (now RunType<T>)', () => {
  it('validates via createIsTypeFor and converges with type-first', () => {
    const isObj = createIsTypeFor(object({a: boolean(), b: number()}));
    expect(isObj({a: true, b: 1})).toBe(true);
    expect(isObj({a: true, b: 'x'})).toBe(false);
    expect(isObj({a: true})).toBe(false);
    // the object-of-boolean half converges with the bare type-first object
    expect(createIsTypeFor(object({a: boolean()}))).toBe(createIsType<{a: boolean}>());
  });
});

describe('leaf builders — literal / regexp', () => {
  it('literal(value) validates and converges per literal kind', () => {
    expect(createIsTypeFor(literal('a'))('a')).toBe(true);
    expect(createIsTypeFor(literal('a'))('b')).toBe(false);
    expect(createIsTypeFor(literal(true))(true)).toBe(true);
    expect(createIsTypeFor(literal(true))(false)).toBe(false);
    expect(createIsTypeFor(literal(42))(42)).toBe(true);
    expect(createIsTypeFor(literal(42))(43)).toBe(false);
    // convergence with the type-first literal types
    expect(createIsTypeFor(literal('a'))).toBe(createIsType<'a'>());
    expect(createIsTypeFor(literal(true))).toBe(createIsType<true>());
  });

  it('regexp() validates RegExp instances and converges', () => {
    const isRe = createIsTypeFor(regexp());
    expect(isRe(/x/)).toBe(true);
    expect(isRe('x')).toBe(false);
    expect(isRe).toBe(createIsType<RegExp>());
  });
});

describe('universal reflectors — runType / reflectRunType (both marker forms)', () => {
  // STATIC form: caller supplies T explicitly.
  it('runType<T>() reflects an arbitrary type', () => {
    const isBoolArr = createIsTypeFor(runType<boolean[]>());
    expect(isBoolArr([true])).toBe(true);
    expect(isBoolArr(['x'])).toBe(false);
  });

  // REFLECTION form: T inferred from a runtime value.
  it('reflectRunType(value) reflects T from the value', () => {
    const sample: boolean[] = [true, false];
    const isBoolArr = createIsTypeFor(reflectRunType(sample));
    expect(isBoolArr([false])).toBe(true);
    expect(isBoolArr([1])).toBe(false);
  });

  // Hash equivalence: both marker forms (and the type-first form) resolve to the
  // SAME cached factory for equivalent T.
  it('static and reflection forms resolve to the same factory', () => {
    const fromStatic = createIsTypeFor(runType<boolean[]>());
    const sample: boolean[] = [true];
    const fromReflect = createIsTypeFor(reflectRunType(sample));
    expect(fromStatic).toBe(fromReflect);
    expect(fromStatic).toBe(createIsType<boolean[]>());
  });

  it('runType<T>() covers a utility type with no dedicated builder', () => {
    const isPartial = createIsTypeFor(runType<Partial<{a: boolean; b: boolean}>>());
    expect(isPartial({a: true})).toBe(true);
    expect(isPartial({})).toBe(true);
    expect(isPartial({a: 1})).toBe(false);
  });
});

describe('compose builders — getTypeErrors schema form', () => {
  it('createTypeErrorsFor returns [] for valid, non-empty for invalid', () => {
    const errs = createTypeErrorsFor(array(boolean()));
    expect(errs([true, false])).toEqual([]);
    expect(errs([1]).length).toBeGreaterThan(0);
  });
});
