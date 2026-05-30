// Value-first ⇄ type-first convergence — the JS analog of the Go-side
// `TestAtomic_FormEquivalence`. Asserts that the branded `typeof Model` of an
// `RT.object({...})` builder model resolves to the SAME precompiled validator
// (same structural id → same cached factory identity) as the hand-written
// type-first `{field: Format*<P>}` equivalent — builders return the brand, so
// `typeof Model` needs no `ModelType<…>` mapping.
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
import * as RT from '@mionjs/ts-go-run-types/define';
import type {FormatString, FormatNumber, FormatDate, FormatBigInt} from '@mionjs/ts-go-run-types/formats';
// Temporal format aliases live on the dedicated subpath (NOT re-exported from
// the root `formats`, so consumers who don't use Temporal never pull the lib).
import type {FormatTemporalInstant, FormatTemporalPlainDate} from '@mionjs/ts-go-run-types/formats/temporal';
import '@mionjs/ts-go-run-types/formats';

const StringFirst = RT.object({
  short: RT.string({maxLength: 5}),
  long: RT.string({minLength: 3}),
  pick: RT.string({allowedValues: {val: ['a', 'b']}}),
});
type StringFirstTF = {
  short: FormatString<{maxLength: 5}>;
  long: FormatString<{minLength: 3}>;
  pick: FormatString<{allowedValues: {val: ['a', 'b']}}>;
};

const NumberFirst = RT.object({
  bounded: RT.number({min: 0, max: 10}),
  whole: RT.number({integer: true}),
});
type NumberFirstTF = {bounded: FormatNumber<{min: 0; max: 10}>; whole: FormatNumber<{integer: true}>};

const DateFirst = RT.object({past: RT.date({max: 'now'})});
type DateFirstTF = {past: FormatDate<{max: 'now'}>};

// An inline value-channel regex converges with the type-first {source,flags}
// form for the same pattern — the Go scanner recovers identical {source,flags}
// from either authoring path.
const RegexFirst = RT.object({slug: RT.string({pattern: /^[a-z-]+$/})});
type RegexFirstTF = {slug: FormatString<{pattern: {source: '^[a-z-]+$'; flags: ''}}>};

// An `RT.optional(...)` field converges with a type-first optional property.
const OptionalFirst = RT.object({req: RT.string({maxLength: 5}), opt: RT.optional(RT.number({min: 0}))});
type OptionalFirstTF = {req: FormatString<{maxLength: 5}>; opt?: FormatNumber<{min: 0}>};

// boolean → plain `boolean`; bigint → FormatBigInt; temporal → FormatTemporal*.
const ScalarFirst = RT.object({active: RT.boolean(), count: RT.bigint({min: 0n, max: 1000n})});
type ScalarFirstTF = {active: boolean; count: FormatBigInt<{min: 0n; max: 1000n}>};
const TemporalFirst = RT.object({
  at: RT.temporal.instant({min: '2020-01-01T00:00:00Z'}),
  day: RT.temporal.plainDate({max: '2030-12-31'}),
});
type TemporalFirstTF = {
  at: FormatTemporalInstant<{min: '2020-01-01T00:00:00Z'}>;
  day: FormatTemporalPlainDate<{max: '2030-12-31'}>;
};

describe('value-first / convergence with type-first', () => {
  it('string model converges to the same validator', () => {
    expect(createIsType<typeof StringFirst>()).toBe(createIsType<StringFirstTF>());
  });

  it('number model converges to the same validator', () => {
    expect(createIsType<typeof NumberFirst>()).toBe(createIsType<NumberFirstTF>());
  });

  it('date model converges to the same validator', () => {
    expect(createIsType<typeof DateFirst>()).toBe(createIsType<DateFirstTF>());
  });

  it('inline regex converges with the type-first {source,flags} form', () => {
    expect(createIsType<typeof RegexFirst>()).toBe(createIsType<RegexFirstTF>());
  });

  it('optional field converges with a type-first optional property', () => {
    expect(createIsType<typeof OptionalFirst>()).toBe(createIsType<OptionalFirstTF>());
  });

  it('boolean + bigint fields converge with type-first', () => {
    expect(createIsType<typeof ScalarFirst>()).toBe(createIsType<ScalarFirstTF>());
  });

  it('temporal fields converge with type-first FormatTemporal*', () => {
    expect(createIsType<typeof TemporalFirst>()).toBe(createIsType<TemporalFirstTF>());
  });
});
