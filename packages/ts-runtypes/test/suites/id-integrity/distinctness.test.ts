// id-integrity / distinctness — the COMPLEMENT of the equivalence drivers.
// validators.test.ts / serializers.test.ts / dataonly.test.ts all assert that
// forms which SHOULD collide resolve to one cached factory (same structural id);
// none asserts the opposite direction — that meaningfully-DISTINCT types get
// DISTINCT ids. A degenerate id scheme that mapped everything to one bucket would
// pass every equivalence driver yet be catastrophically wrong; this driver pins
// that distinct types do NOT share a cached factory.
//
// Mechanism (same as assertValidatorIdIntegrity): `createValidate(RT.x())` returns
// the CACHED factory for the schema's structural id, so reference inequality
// (`.not.toBe`) between two distinct schemas is a same-as / distinct-id assertion.

import {describe, it, expect} from 'vitest';
import {createValidate} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

// Each pair is two structurally-distinct types whose cached validate factories
// MUST differ. A failure here means the two distinct types collapsed to ONE
// cached factory — a real id-collision bug, not a test artefact.
const DISTINCT_PAIRS: ReadonlyArray<[string, () => unknown, () => unknown]> = [
  // literal vs its widened primitive — the classic collision risk
  ['literal(2) vs number()', () => createValidate(RT.literal(2)), () => createValidate(TF.number())],
  // two distinct numeric literals
  ['literal(2) vs literal(3)', () => createValidate(RT.literal(2)), () => createValidate(RT.literal(3))],
  // string-literal vs its primitive
  ["literal('a') vs string()", () => createValidate(RT.literal('a')), () => createValidate(TF.string())],
  // distinct primitives
  ['string() vs number()', () => createValidate(TF.string()), () => createValidate(TF.number())],
  // distinct object shapes (extra field)
  [
    'object{a} vs object{a,b}',
    () => createValidate(RT.object({a: TF.number()})),
    () => createValidate(RT.object({a: TF.number(), b: TF.number()})),
  ],
  // same field name, different field type
  [
    'object{a:number} vs object{a:string}',
    () => createValidate(RT.object({a: TF.number()})),
    () => createValidate(RT.object({a: TF.string()})),
  ],
  // array element type differs
  ['number[] vs string[]', () => createValidate(RT.array(TF.number())), () => createValidate(RT.array(TF.string()))],
];

describe('id-integrity / distinctness — meaningfully-distinct types resolve DISTINCT cached factories', () => {
  for (const [label, left, right] of DISTINCT_PAIRS) {
    it(`${label} — distinct cached factories (distinct structural ids)`, () => {
      expect(left(), `${label}: distinct types must NOT share a cached factory (id collision)`).not.toBe(right());
    });
  }
});
