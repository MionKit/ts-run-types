// isType adapter for TypeScript UTILITY types — Partial / Required /
// Pick / Omit / Exclude / Extract / NonNullable / ReturnType /
// Readonly / Uppercase, plus intersection-with-modifier examples that
// flip a property's optionality.
//
// tsgo resolves every utility at the type-checker layer to its
// concrete shape, so this adapter exercises **no new emit code** —
// it's pure regression coverage that the utilities thread through
// our cache + emit pipeline without surprises.

import {afterEach, describe, expect, it} from 'vitest';
import {VALIDATION_SUITE, type ValidationCase} from '../suites/validation-suite.ts';

let ranTests = 0;
afterEach(() => {
  ranTests++;
});

async function assertIsType(c: ValidationCase): Promise<void> {
  if (!c.isType) throw new Error(`case ${c.title}: missing isType thunk`);
  const isType = await c.isType();
  const {valid, invalid} = c.getSamples();
  valid.forEach((v, i) => {
    expect(isType(v), `${c.title}: valid[${i}] should pass`).toBe(true);
  });
  invalid.forEach((v, i) => {
    expect(isType(v), `${c.title}: invalid[${i}] should fail`).toBe(false);
  });
}

describe('isType / UTILITY', () => {
  it('Partial<Person>', () => assertIsType(VALIDATION_SUITE.UTILITY.partial));
  it('Required<MaybePerson>', () => assertIsType(VALIDATION_SUITE.UTILITY.required));
  it("Pick<Person, 'name' | 'createdAt'>", () => assertIsType(VALIDATION_SUITE.UTILITY.pick));
  it("Omit<Person, 'age'>", () => assertIsType(VALIDATION_SUITE.UTILITY.omit));
  it("Exclude<'name' | 'age' | 'createdAt', 'age'>", () => assertIsType(VALIDATION_SUITE.UTILITY.exclude_atomic));
  it("Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>", () => assertIsType(VALIDATION_SUITE.UTILITY.extract_atomic));
  it("Exclude<Shape, {kind: 'circle'}>", () => assertIsType(VALIDATION_SUITE.UTILITY.exclude_from_object_union));
  it('NonNullable<string | number | null | undefined>', () => assertIsType(VALIDATION_SUITE.UTILITY.non_nullable));
  it('ReturnType<(...) => Date>', () => assertIsType(VALIDATION_SUITE.UTILITY.return_type));
  it('Readonly<Person>', () => assertIsType(VALIDATION_SUITE.UTILITY.readonly));
  // Note: Uppercase / Lowercase / Capitalize / Uncapitalize are NOT
  // covered as isType constraints — they belong in the future
  // validation-constraints library (alongside number brand types).
  // See the comment above `intersection_with_required_override` in
  // validation-suite.ts.
  it("Partial<Person> & Required<Pick<Person, 'name'>>", () => assertIsType(VALIDATION_SUITE.UTILITY.intersection_with_required_override));
  it("Omit<{a; b?; c}, 'a'> — preserves optional flag on remaining props", () => assertIsType(VALIDATION_SUITE.UTILITY.omit_keeping_optional));

  it('all utility isType tests ran', () => {
    const activeCount = Object.values(VALIDATION_SUITE.UTILITY).filter((c) => c.isType).length;
    expect(ranTests).toBe(activeCount);
  });
});
