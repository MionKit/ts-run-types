// Type-safety regression tests for the marker package's public surface.
//
// The body of each `assertions...` function below is a type-only test.
// The functions are referenced (so esbuild does not tree-shake them) but
// never invoked, so the bodies have no runtime effect. The `@ts-expect-error`
// directives are the actual assertions — when a regression makes
// `getRunTypeId<any>()` compile again, tsc errors with TS2578 "Unused
// '@ts-expect-error' directive" on the line above the call.
//
// Why this shape: vitest's typecheck mode is global (would surface a
// dozen unrelated preexisting type errors); we want a focused regression
// test for the RejectAny guard. The IDE catches regressions immediately;
// CI catches them when anyone runs `tsc -p packages/ts-go-run-types/tsconfig.test.json --noEmit`
// against the package (separate cleanup project).

import {describe, expect, test} from 'vitest';
import {getRunTypeId, reflectRunTypeId} from '../src/index.ts';
import * as RT from '../src/define/index.ts';
import type {FormatString, FormatNumber} from '../src/formats/index.ts';

// Reference the assertion bodies from a real test so they don't get
// flagged as dead code by lint. The body is never invoked.
test('type-only assertions are referenced (no runtime work here)', () => {
  expect(typeof assertionsAcceptConcreteTypes).toBe('function');
  expect(typeof assertionsRejectAny).toBe('function');
  expect(typeof assertionsAcceptUnknown).toBe('function');
  expect(typeof assertionsValueFirstDefine).toBe('function');
});

// Runtime contract: the markers throw at runtime when no id is injected
// (the vite plugin's job). Verifies the throw is reachable so consumers
// who forget to wire the plugin see a clear error instead of getting a
// useless empty-string id.
describe('runtime contract — markers throw without injected id', () => {
  test('getRunTypeId() throws when no id is provided', () => {
    expect(() => getRunTypeId<string>()).toThrow(/getRunTypeId\(\): no id injected/);
  });

  test('reflectRunTypeId() throws when no id is provided', () => {
    const value: string = 'hello';
    expect(() => reflectRunTypeId(value)).toThrow(/reflectRunTypeId\(\): no id injected/);
  });
});

function assertionsAcceptConcreteTypes(): void {
  // Concrete T: marker resolves normally. No directive — these should compile.
  const _stringId = getRunTypeId<string>('mock-id' as any);
  const _userId = getRunTypeId<{name: string}>('mock-id' as any);
  const _value: string = 'hello';
  const _inferredStringId = reflectRunTypeId(_value, 'mock-id' as any);
  const _user: {name: string} = {name: 'alice'};
  const _inferredUserId = reflectRunTypeId(_user, 'mock-id' as any);
  void _stringId;
  void _userId;
  void _inferredStringId;
  void _inferredUserId;
}

function assertionsRejectAny(): void {
  // @ts-expect-error — `any` poisons the cache entry; RejectAny surfaces
  // this at the call site instead of letting it slip through to a noop
  // runtime entry.
  getRunTypeId<any>('mock-id' as any);

  const anyValue: any = JSON.parse('{}');
  // @ts-expect-error — value-inferred `any` is the most common path to a
  // useless cache entry. RejectAny forces the caller to annotate or cast
  // to a concrete shape first.
  reflectRunTypeId(anyValue, 'mock-id' as any);
}

function assertionsAcceptUnknown(): void {
  // `unknown` is the opt-in escape hatch: unlike `any` it doesn't poison
  // downstream call sites — `unknown` values must be narrowed before
  // they're useful, so the failure mode surfaces at the consumer, not at
  // the marker. Should compile without a directive.
  const _unknownId = getRunTypeId<unknown>('mock-id' as any);
  void _unknownId;
}

function assertionsValueFirstDefine(): void {
  // Valid models compile — no directive. Each builder type-checks its own
  // params, and `RT.object(...)` assembles them. `RT.optional(...)` wraps any field.
  const _ok = RT.object({
    name: RT.string({minLength: 1, maxLength: 50}),
    age: RT.number({min: 0, max: 120, integer: true}),
    born: RT.date({max: 'now'}),
    big: RT.bigint({min: 0n, max: 1000n}),
    active: RT.boolean(),
    at: RT.temporal.instant({max: 'now'}),
    day: RT.optional(RT.temporal.plainDate()),
    nick: RT.optional(RT.string({maxLength: 8})),
  });
  void _ok;

  // Date sharing the number bounds is fine — `min`/`max`/`gt`/`lt` are valid
  // for the date param interface too.
  const _okDate = RT.object({born: RT.date({min: 'now', max: '2030-01-01T00:00:00'})});
  void _okDate;

  // A regex `pattern` is allowed on a string field in all three value-channel
  // forms (inline /…/, {source, flags}, registerFormatPattern result).
  const _okRegex = RT.object({
    slug: RT.string({pattern: /^[a-z-]+$/}),
    digits: RT.string({pattern: {source: '^[0-9]+$', flags: ''}}),
  });
  void _okRegex;

  // Return type IS the branded format (not the old `{type, formatParams}`
  // config). Builders return the brand directly, so `typeof Model` is the type.
  const _s: FormatString<{maxLength: 5}> = RT.string({maxLength: 5});
  const _n: FormatNumber<{min: 0}> = RT.number({min: 0});
  const _b: boolean = RT.boolean();
  void _s;
  void _n;
  void _b;

  // @ts-expect-error — the result is the brand, NOT the old `{type, formatParams}`
  // config object the first version returned.
  const _notConfig: {type: 'string'; formatParams: {maxLength: 5}} = RT.string({maxLength: 5});
  void _notConfig;

  // A bare `optional(...)` outside `object` is well-defined — it yields the
  // `{__opt}` carrier (which `object` unwraps). The carrier is NOT itself a
  // usable format brand, so it can't leak into a reflected position.
  const _carrier: {readonly __opt: FormatNumber<{min: 0}>} = RT.optional(RT.number({min: 0}));
  void _carrier;
  // @ts-expect-error — the `{__opt}` carrier is not assignable to the bare format.
  const _carrierLeak: FormatNumber<{min: 0}> = RT.optional(RT.number({min: 0}));
  void _carrierLeak;

  // Cross-family param misuse is caught at the BUILDER CALL — each builder
  // types its own params arg, so the bad key errors locally (no exclusive-union
  // machinery needed). These replace the old inline-config leakage assertions.

  // @ts-expect-error — `maxLength` is a string param, not a number param.
  RT.number({maxLength: 5});

  // @ts-expect-error — `min` (number/date bound) is not a string param.
  RT.string({min: 0});

  // @ts-expect-error — `integer` (number-only) is not a date param.
  RT.date({integer: true});

  // @ts-expect-error — `boolean` takes no params at all.
  RT.boolean({maxLength: 5});

  // @ts-expect-error — `pattern` is a string-only param, not a number param.
  RT.number({pattern: /^[0-9]+$/});

  // @ts-expect-error — `bigint` bounds are bigint-valued; a number `5` (not
  // `5n`) errors on the value type.
  RT.bigint({min: 5});

  // @ts-expect-error — a temporal builder's only params are min/max/gt/lt; a
  // string param (`maxLength`) is rejected.
  RT.temporal.instant({maxLength: 5});
}
