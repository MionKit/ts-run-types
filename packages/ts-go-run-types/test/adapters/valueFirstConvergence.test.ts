// Value-first ⇄ type-first convergence — the JS analog of the Go-side
// `TestAtomic_FormEquivalence`. Asserts that a `ModelType<typeof Model>`
// derived from a `define({...})` config resolves to the SAME precompiled
// validator (same structural id → same cached factory identity) as the
// hand-written type-first `{field: Format*<P>}` equivalent.
//
// `createIsType` returns the cached `RTCompiledFn` for a runtype id, so
// `toBe` (reference identity) is a hash-equality assertion: two different
// structural ids would yield two different cached factories. This is the
// "both front-ends, one engine" guarantee — the value-first surface is a thin
// authoring door, not a second validator.
//
// `import '@mionjs/ts-go-run-types/formats'` is a load-bearing side-effect
// import (registers the format pure-fns the emitted validators reach).

import {describe, expect, it} from 'vitest';
import {createIsType} from '@mionjs/ts-go-run-types';
import {define, type ModelType} from '@mionjs/ts-go-run-types/define';
import type {FormatString, FormatNumber, FormatDate} from '@mionjs/ts-go-run-types/formats';
import '@mionjs/ts-go-run-types/formats';

const StringFirst = define({
  short: {type: 'string', maxLength: 5},
  long: {type: 'string', minLength: 3},
  pick: {type: 'string', allowedValues: {val: ['a', 'b']}},
});
type StringFirstTF = {
  short: FormatString<{maxLength: 5}>;
  long: FormatString<{minLength: 3}>;
  pick: FormatString<{allowedValues: {val: ['a', 'b']}}>;
};

const NumberFirst = define({
  bounded: {type: 'number', min: 0, max: 10},
  whole: {type: 'number', integer: true},
});
type NumberFirstTF = {bounded: FormatNumber<{min: 0; max: 10}>; whole: FormatNumber<{integer: true}>};

const DateFirst = define({past: {type: 'date', max: 'now'}});
type DateFirstTF = {past: FormatDate<{max: 'now'}>};

describe('value-first / convergence with type-first', () => {
  it('string model converges to the same validator', () => {
    expect(createIsType<ModelType<typeof StringFirst>>()).toBe(createIsType<StringFirstTF>());
  });

  it('number model converges to the same validator', () => {
    expect(createIsType<ModelType<typeof NumberFirst>>()).toBe(createIsType<NumberFirstTF>());
  });

  it('date model converges to the same validator', () => {
    expect(createIsType<ModelType<typeof DateFirst>>()).toBe(createIsType<DateFirstTF>());
  });
});
