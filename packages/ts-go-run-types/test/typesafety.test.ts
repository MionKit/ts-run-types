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
import {define} from '../src/define/index.ts';

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
  // Valid value-first configs compile — no directive. Each field's params
  // are checked against the matching format's param interface.
  const _ok = define({
    name: {type: 'string', minLength: 1, maxLength: 50},
    age: {type: 'number', min: 0, max: 120, integer: true},
    born: {type: 'date', max: 'now'},
  });
  void _ok;

  // @ts-expect-error — an unknown discriminator is rejected locally on the
  // offending field (TS2322 on `type`), not as a deep generic blowup. This
  // is the discriminator-as-local-error property the value-first surface buys.
  define({flag: {type: 'boolean'}});

  // @ts-expect-error — cross-family param leakage is caught: `maxLength` is a
  // string-only param, so on a `number` field the exclusive-union negation
  // types it `never` and assigning `5` errors locally (TS2322). Without the
  // negation TypeScript's union excess-property check would let it through.
  define({age: {type: 'number', maxLength: 5}});

  // @ts-expect-error — symmetric case: `min` (number/date) on a string field.
  define({name: {type: 'string', min: 0}});

  // @ts-expect-error — `integer` (number-only) on a date field.
  define({born: {type: 'date', integer: true}});

  // Date sharing the number bounds is fine — `min`/`max`/`gt`/`lt` are valid
  // for both number and date, so they are NOT forbidden on a date field.
  const _okDate = define({born: {type: 'date', min: 'now', max: '2030-01-01T00:00:00'}});
  void _okDate;

  // A regex `pattern` is allowed on a string field in all three value-channel
  // forms (inline /…/, {source, flags}, registerFormatPattern result).
  const _okRegex = define({
    slug: {type: 'string', pattern: /^[a-z-]+$/},
    digits: {type: 'string', pattern: {source: '^[0-9]+$', flags: ''}},
  });
  void _okRegex;

  // @ts-expect-error — `pattern` is a string-only param, so the exclusive-union
  // negation forbids it on a number field.
  define({age: {type: 'number', pattern: /^[0-9]+$/}});
}
