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

  // KNOWN GAP (docs/value-first-formats.md → finding b): a param valid for a
  // DIFFERENT discriminator (`maxLength` is a string param, used here on a
  // number field) is NOT rejected — TypeScript's excess-property check against
  // a union allows any key present in some member. So the line below compiles
  // (no @ts-expect-error). The misplaced param is harmlessly ignored by the
  // number-format emitter at validation time; tightening this to a per-field
  // error is the deferred "stricter validator" follow-up.
  const _leak = define({age: {type: 'number', maxLength: 5}});
  void _leak;
}
