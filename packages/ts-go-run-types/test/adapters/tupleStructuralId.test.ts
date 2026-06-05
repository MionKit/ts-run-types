// Regression guard for the tuple structural-id collision.
//
// A rest tuple `[number, ...string[]]` and a fixed tuple `[number, string]`
// reduce to the same element-TYPE list, so before folding the element flags
// into the structural id they both hashed to `Tuple[<number>,<string>]`,
// collided on a single project-global cache slot, and the
// nondeterministically-chosen winner gave one of them the wrong validator —
// surfacing as a flaky `tuple_rest` failure (`[3]` rejected with
// "index 1 expected string").
//
// `createIsType<T>()` returns the CACHED factory for T's structural id, so
// `.not.toBe` is a hash-INEQUALITY assertion (a collision makes the two calls
// return the same object). This is DETERMINISTIC — it does not depend on which
// validator won the collided slot — and mirrors how valueFirstConvergence.test
// uses `.toBe` for the converse (same-id) check. Go-side twin:
// internal/compiled/runtype/typeid/structural_test.go
// → TestStructural_TupleRestNotDeduplicatedWithFixed.

import {createIsType} from '@mionjs/ts-go-run-types';
import {describe, expect, it} from 'vitest';

describe('tuple structural-id distinctness (regression)', () => {
  it('rest tuple resolves to a different cached validator than the same-element fixed tuple', () => {
    expect(createIsType<[number, ...string[]]>()).not.toBe(createIsType<[number, string]>());
  });

  it('rest and fixed tuples validate correctly (a collision flips one)', () => {
    const rest = createIsType<[number, ...string[]]>();
    const fixed = createIsType<[number, string]>();
    // The rest tail absorbs zero-or-more trailing strings.
    expect(rest([3])).toBe(true);
    expect(rest([3, 'a', 'b'])).toBe(true);
    // The fixed tuple requires exactly two slots.
    expect(fixed([3])).toBe(false);
    expect(fixed([3, 'a'])).toBe(true);
  });
});
