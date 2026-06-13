// ValidateOptions variant dispatch — the JS-side guarantees that lock in the
// "creating the same type with different ValidateOptions works" contract:
//
//   1. The structural type id is a function of T only. Passing options
//      never changes the id (`getRunTypeId<T>()` returns the same value
//      regardless of options the caller passes elsewhere for the same T).
//   2. Each `(family, options-tuple)` pair dispatches to a DISTINCT
//      cached factory — different variant cache keys (`val_<id>` vs
//      `itNL_<id>` vs `valNA_<id>` vs `itNLA_<id>`).
//   3. The variant body actually changes behaviour: the `noLiterals`
//      variant accepts the base kind beyond the exact literal; the
//      `noIsArrayCheck` variant skips the leading `Array.isArray` guard.
//   4. Schema-form (`createValidate`) converges with marker-form for
//      the same `T + options` — both go through `buildVariantKey` and
//      resolve to a factory that exhibits the same behaviour.
//
// Style mirrors the existing reference-identity guards in
// `tupleStructuralId.test.ts` and the id-integrity suite —
// `.toBe` is a cache-identity check, `.not.toBe` is a cache-distinct
// check. Behavioural assertions backstop the dispatch — they catch
// the case where the JS variant key lookup misses and silently falls
// back to the identity validator.

import * as TF from 'ts-runtypes/formats';
import {describe, expect, it} from 'vitest';
import {createValidate, createGetValidationErrors, getRunTypeId} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';

describe('ValidateOptions — type-id stays structural across option combinations', () => {
  it('static and reflect forms of the same T share the same id', () => {
    const staticId = getRunTypeId<'a'>();
    const v = 'a' as const;
    const reflectId = getRunTypeId(v);
    expect(staticId).toBe(reflectId);
  });

  it('string[] id is identical whether referenced bare or via a noIsArrayCheck call site', () => {
    const bareId: string = getRunTypeId<string[]>();
    // Build the variant factory at this call site too — its sole job is
    // to prove the id-emitting marker doesn't fold options into the id.
    const variantFactory = createValidate<string[]>(undefined, {noIsArrayCheck: true});
    expect(variantFactory).toBeTypeOf('function');
    const afterId: string = getRunTypeId<string[]>();
    expect(afterId).toBe(bareId);
  });
});

describe('ValidateOptions — different option tuples dispatch to distinct cached factories', () => {
  it("`createValidate<'a'>()` and `createValidate<'a'>(undefined, {noLiterals: true})` are different cached fns", () => {
    expect(createValidate<'a'>()).not.toBe(createValidate<'a'>(undefined, {noLiterals: true}));
  });

  it('`createValidate<string[]>()` and `createValidate<string[]>(undefined, {noIsArrayCheck: true})` are different cached fns', () => {
    expect(createValidate<string[]>()).not.toBe(createValidate<string[]>(undefined, {noIsArrayCheck: true}));
  });

  it('the same T with the same options resolves to ONE cached factory', () => {
    expect(createValidate<string[]>(undefined, {noIsArrayCheck: true})).toBe(
      createValidate<string[]>(undefined, {noIsArrayCheck: true})
    );
  });
});

describe('ValidateOptions — variant bodies actually differ in behaviour', () => {
  it("plain `'a'` rejects `'b'`; `noLiterals` variant accepts every string", () => {
    const plain = createValidate<'a'>();
    const variant = createValidate<'a'>(undefined, {noLiterals: true});
    expect(plain('a')).toBe(true);
    expect(plain('b')).toBe(false);
    expect(variant('a')).toBe(true);
    expect(variant('b')).toBe(true);
    expect(variant(42)).toBe(false);
  });

  it('plain `string[]` rejects a non-array; `noIsArrayCheck` variant lets non-array values past the guard', () => {
    const plain = createValidate<string[]>();
    const variant = createValidate<string[]>(undefined, {noIsArrayCheck: true});
    // Plain validator rejects 42 (typeof !== array).
    expect(plain(42)).toBe(false);
    // Variant strips the Array.isArray guard — 42 has no .length, the
    // for-loop body never enters, so the validator passes. Mirrors the
    // documented trade-off (Array.ts:570-573).
    expect(variant(42)).toBe(true);
    // Both still walk elements when an array is supplied.
    expect(plain(['x'])).toBe(true);
    expect(variant(['x'])).toBe(true);
    expect(plain([42])).toBe(false);
    expect(variant([42])).toBe(false);
  });
});

describe('ValidateOptions — getValidationErrors variant parity with validate', () => {
  it('`noLiterals` variant of getValidationErrors uses the base-kind label', () => {
    const errors = createGetValidationErrors<'a'>(undefined, {noLiterals: true});
    // `noLiterals` accepts any string — including the non-matching 'b' —
    // so the expected error array is empty.
    expect(errors('b')).toEqual([]);
    // A non-string still fails, with the base-kind label `string`.
    const out = errors(42);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({path: [], expected: 'string'});
  });

  it('`noIsArrayCheck` variant of getValidationErrors skips the top-level array guard', () => {
    const errors = createGetValidationErrors<string[]>(undefined, {noIsArrayCheck: true});
    // Non-array input: no top-level error, no inner element loop runs.
    expect(errors(42)).toEqual([]);
    // Array with a bad element: the element check still fires.
    expect(errors([42])[0]).toMatchObject({path: [0], expected: 'string'});
  });
});

describe('ValidateOptions — schema-form ⇄ marker-form convergence', () => {
  it('plain schema-form and plain marker-form both reject `[42]` for `string[]`', () => {
    const marker = createValidate<string[]>();
    const schema = createValidate(RT.array(TF.string()));
    expect(marker([42])).toBe(false);
    expect(schema([42])).toBe(false);
  });

  it('schema-form `noIsArrayCheck` variant skips the guard, just like the marker form', () => {
    const marker = createValidate<string[]>(undefined, {noIsArrayCheck: true});
    const schema = createValidate(RT.array(TF.string()), {noIsArrayCheck: true});
    // Both let a non-array slip past the guard…
    expect(marker(42)).toBe(true);
    expect(schema(42)).toBe(true);
    // …but still reject a bad element.
    expect(marker([42])).toBe(false);
    expect(schema([42])).toBe(false);
  });

  it('schema-form `noIsArrayCheck` variant agrees with marker-form on getValidationErrors output', () => {
    const marker = createGetValidationErrors<string[]>(undefined, {noIsArrayCheck: true});
    const schema = createGetValidationErrors(RT.array(TF.string()), {noIsArrayCheck: true});
    expect(marker(42)).toEqual([]);
    expect(schema(42)).toEqual([]);
    expect(marker([42])).toEqual(schema([42]));
  });
});

describe('ValidateOptions — combined variants build the multi-letter suffix', () => {
  it('`{noLiterals: true, noIsArrayCheck: true}` resolves to a factory distinct from each single-option variant', () => {
    type T = readonly 'x'[];
    const plain = createValidate<T>();
    const nlOnly = createValidate<T>(undefined, {noLiterals: true});
    const naOnly = createValidate<T>(undefined, {noIsArrayCheck: true});
    const both = createValidate<T>(undefined, {noLiterals: true, noIsArrayCheck: true});
    // All four are distinct cache entries — proves the variant suffix
    // is constructed from both options together (`NLA`), not collapsed
    // to one of the singles.
    expect(plain).not.toBe(nlOnly);
    expect(plain).not.toBe(naOnly);
    expect(plain).not.toBe(both);
    expect(nlOnly).not.toBe(naOnly);
    expect(nlOnly).not.toBe(both);
    expect(naOnly).not.toBe(both);
  });
});
