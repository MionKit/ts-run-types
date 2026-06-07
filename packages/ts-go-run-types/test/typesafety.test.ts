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
import type {RunType, Static} from '../src/index.ts';
import * as RT from '../src/schema/index.ts';
import type {FormatString, FormatNumber} from '../src/formats/index.ts';

// Reference the assertion bodies from a real test so they don't get
// flagged as dead code by lint. The body is never invoked.
test('type-only assertions are referenced (no runtime work here)', () => {
  expect(typeof assertionsAcceptConcreteTypes).toBe('function');
  expect(typeof assertionsRejectAny).toBe('function');
  expect(typeof assertionsAcceptUnknown).toBe('function');
  expect(typeof assertionsValueFirstDefine).toBe('function');
  expect(typeof assertionsComposers).toBe('function');
  expect(typeof assertionsNewBuilders).toBe('function');
  expect(typeof assertionsComposerExactInference).toBe('function');
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
  // Valid models compile — no directive. Each builder type-checks its own params,
  // and `RT.object(...)` assembles them. Property modifiers apply via the
  // `RT.optional(field)` shortcut or the general `RT.propMod({optional?,
  // readonly?}, field)`.
  const _ok = RT.object({
    name: RT.string({minLength: 1, maxLength: 50}),
    age: RT.number({min: 0, max: 120, integer: true}),
    born: RT.date({max: 'now'}),
    big: RT.bigint({min: 0n, max: 1000n}),
    active: RT.boolean(),
    at: RT.temporal.instant({max: 'now'}),
    day: RT.optional(RT.temporal.plainDate()), // shortcut
    nick: RT.propMod({optional: true}, RT.string({maxLength: 8})), // general form
    slugRo: RT.propMod({readonly: true}, RT.string({maxLength: 8})), // readonly
  });
  void _ok;

  // Date sharing the number bounds is fine — `min`/`max`/`gt`/`lt` are valid
  // for the date param interface too.
  const _okDate = RT.object({born: RT.date({min: 'now', max: '2030-01-01T00:00:00'})});
  void _okDate;

  // A `pattern` is allowed on a string field as an inline `{source, flags?,
  // mockSamples}` object or a `registerFormatPattern` result — both carry
  // mockSamples (a `StringParams.pattern`, same as the type-first surface).
  const _okRegex = RT.object({
    slug: RT.string({pattern: {source: '^[a-z-]+$', flags: '', mockSamples: ['a-b']}}),
    digits: RT.string({pattern: {source: '^[0-9]+$', flags: '', mockSamples: ['123']}}),
  });
  void _okRegex;

  // A pattern MUST carry mockSamples — the value-first surface no longer loosens
  // `StringParams.pattern` to allow a samples-less regex.
  // @ts-expect-error — a bare `/regex/` is not a valid pattern (no mockSamples).
  RT.string({pattern: /^[a-z-]+$/});
  // @ts-expect-error — an inline `{source, flags}` pattern without mockSamples is rejected.
  RT.string({pattern: {source: '^[0-9]+$', flags: ''}});

  // Leaf builders return `RunType<FormatX<P>>` — the generic run-type carrying
  // the source type — NOT the bare brand.
  const _s: RunType<FormatString<{maxLength: 5}>> = RT.string({maxLength: 5});
  const _n: RunType<FormatNumber<{min: 0}>> = RT.number({min: 0});
  const _b: RunType<boolean> = RT.boolean();
  void _s;
  void _n;
  void _b;

  // `Static<…>` recovers the format type the RunType carries — both
  // directions compile only if it resolves EXACTLY to `FormatString<P>` (the
  // no-`infer` indexed-access round-trip).
  const _rtToFormat = (x: Static<RunType<FormatString<{maxLength: 5}>>>): FormatString<{maxLength: 5}> => x;
  const _formatToRt = (x: FormatString<{maxLength: 5}>): Static<RunType<FormatString<{maxLength: 5}>>> => x;
  void _rtToFormat;
  void _formatToRt;

  // @ts-expect-error — the result is a `RunType<…>`, NOT the bare format brand.
  const _notBareFormat: FormatString<{maxLength: 5}> = RT.string({maxLength: 5});
  void _notBareFormat;

  // A bare `optional(...)` / `propMod(...)` outside `object` is well-defined — it
  // yields the modifier carrier (which `object` unwraps). The carrier is NOT
  // itself a usable format brand, so it can't leak into a reflected position.
  const _carrier = RT.optional(RT.number({min: 0}));
  void _carrier;
  // @ts-expect-error — the modifier carrier is not assignable to the bare format.
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

function assertionsComposers(): void {
  // Composer builders return `RunType<…>` for the COMPOSED type — these
  // positive assignments compile only if the carried type is exactly right
  // (no `infer`: `MapTuple` over the child tuple, `[number]` for unions,
  // positional `A & B` for intersections).
  const _arr: RunType<boolean[]> = RT.array(RT.boolean());
  const _tup: RunType<[boolean, boolean]> = RT.tuple([RT.boolean(), RT.boolean()]);
  const _tupRest: RunType<[boolean, ...boolean[]]> = RT.tuple([RT.boolean()], RT.boolean());
  const _uni: RunType<boolean | 'x'> = RT.union([RT.boolean(), RT.literal('x')]);
  const _int: RunType<{a: boolean} & {b: boolean}> = RT.intersection(RT.object({a: RT.boolean()}), RT.object({b: RT.boolean()}));
  const _rec: RunType<Record<string, boolean>> = RT.record(RT.boolean());
  const _obj: RunType<{a: boolean}> = RT.object({a: RT.boolean()});
  void _arr;
  void _tup;
  void _tupRest;
  void _uni;
  void _int;
  void _rec;
  void _obj;

  // Leaf builders: `literal` narrows via `const` to the literal type; `regexp` /
  // `symbol` are fixed.
  const _litStr: RunType<'a'> = RT.literal('a');
  const _litTrue: RunType<true> = RT.literal(true);
  const _litNum: RunType<42> = RT.literal(42);
  const _litNull: RunType<null> = RT.literal(null);
  const _re: RunType<RegExp> = RT.regexp();
  const _sym: RunType<symbol> = RT.symbol();
  void _litStr;
  void _litTrue;
  void _litNum;
  void _litNull;
  void _re;
  void _sym;

  // `Static<…>` round-trips a composed type back to its tuple form.
  const _back = (x: Static<RunType<[boolean, number]>>): [boolean, number] => x;
  void _back;

  // @ts-expect-error — `array` takes a RunType schema, not the bare builder fn.
  RT.array(RT.boolean);

  // @ts-expect-error — `literal` only accepts string/number/bigint/boolean/null/undefined.
  RT.literal({});

  // @ts-expect-error — the result is a `RunType<…>`, NOT the bare composed type.
  const _notBare: boolean[] = RT.array(RT.boolean());
  void _notBare;
}

function assertionsNewBuilders(): void {
  // Top / bottom atomic builders carry exactly their kind.
  const _any: RunType<any> = RT.any();
  const _unk: RunType<unknown> = RT.unknown();
  const _nev: RunType<never> = RT.never();
  const _voi: RunType<void> = RT.void();
  void _any;
  void _unk;
  void _nev;
  void _voi;

  // 3-arg tuple: the SECOND array is the trailing OPTIONAL elements
  // (`Partial<MapTuple<O>>` → each `?`); a third RunType is the rest element.
  const _tupOpt: RunType<[number, bigint?, boolean?]> = RT.tuple([RT.number()], [RT.bigint(), RT.boolean()]);
  const _tupOptRest: RunType<[number, bigint?, ...string[]]> = RT.tuple([RT.number()], [RT.bigint()], RT.string());
  void _tupOpt;
  void _tupOptRest;

  // func(): ret defaults to void. The wired cases use no typed params (function
  // values lower per position); `func([], any())` is the `() => any` form that
  // tuple_with_non_serializable and interface_with_method author. (A typed-param
  // func carries each leaf's format brand on its param — fine for the scanner,
  // but not asserted as plain primitives here.)
  const _fn0: RunType<() => void> = RT.func();
  const _fnAny: RunType<() => any> = RT.func([], RT.any());
  void _fn0;
  void _fnAny;

  // classType(C): recovers the class's nominal instance type off the ctor.
  class _Point {
    x = 0;
    y = 0;
  }
  const _cls: RunType<_Point> = RT.classType(_Point);
  void _cls;

  // classType generic pin: the single-param form infers for non-generic classes
  // (above) and pins a generic class's instantiation via an explicit Instance arg.
  class _Box<T> {
    contents!: T;
  }
  const _boxNum: RunType<_Box<number>> = RT.classType<_Box<number>>(_Box);
  void _boxNum;

  // func tuple-overload: params as a single tuple RunType (so optional/rest params
  // ride tuple()); `(...args: T)` ≡ the spread tuple. Brand-free booleans so the
  // positive assignment matches exactly.
  const _fnTup: RunType<(a: boolean, b?: boolean) => void> = RT.func(RT.tuple([RT.boolean()], [RT.boolean()]));
  void _fnTup;

  // parameters(fn): extracts the function's parameter tuple — fixed, trailing-
  // optional, and rest forms each converge with `Parameters<F>`.
  const _pFixed: RunType<[boolean, boolean]> = RT.parameters(RT.func([RT.boolean(), RT.boolean()]));
  const _pOpt: RunType<[boolean, boolean?]> = RT.parameters(RT.func(RT.tuple([RT.boolean()], [RT.boolean()])));
  const _pRest: RunType<[boolean, ...boolean[]]> = RT.parameters(RT.func(RT.tuple([RT.boolean()], RT.boolean())));
  void _pFixed;
  void _pOpt;
  void _pRest;

  // utility-type builders: each brand is the RESOLVED stdlib utility type. Brand-
  // free booleans/literals so the positive assignment matches exactly.
  const _uModel = RT.object({a: RT.boolean(), b: RT.boolean()});
  const _uPartial: RunType<Partial<{a: boolean; b: boolean}>> = RT.partial(_uModel);
  const _uRequired: RunType<Required<{a?: boolean; b?: boolean}>> = RT.required(
    RT.object({a: RT.optional(RT.boolean()), b: RT.optional(RT.boolean())})
  );
  const _uPick: RunType<Pick<{a: boolean; b: boolean}, 'a'>> = RT.pick(_uModel, ['a']);
  const _uOmit: RunType<Omit<{a: boolean; b: boolean}, 'a'>> = RT.omit(_uModel, ['a']);
  const _uExclude: RunType<'x'> = RT.exclude(RT.union([RT.literal('x'), RT.literal('y')]), RT.literal('y'));
  const _uExtract: RunType<'x'> = RT.extract(RT.union([RT.literal('x'), RT.literal('y')]), RT.literal('x'));
  const _uNonNull: RunType<boolean> = RT.nonNullable(RT.union([RT.boolean(), RT.literal(null)]));
  const _uReadonly: RunType<Readonly<{a: boolean}>> = RT.readonly(RT.object({a: RT.boolean()}));
  const _uReturn: RunType<boolean> = RT.returnType(RT.func([RT.number()], RT.boolean()));
  void _uModel;
  void _uPartial;
  void _uRequired;
  void _uPick;
  void _uOmit;
  void _uExclude;
  void _uExtract;
  void _uNonNull;
  void _uReadonly;
  void _uReturn;

  // record(key, value): the key schema's type becomes the index-signature key. A
  // templateLiteral key is unbranded, so it stays the `api/${string}` pattern.
  const _recTpl: RunType<Record<`api/${string}`, boolean>> = RT.record(RT.templateLiteral(['api/', RT.string()]), RT.boolean());
  void _recTpl;

  // templateLiteral: produces a REAL template-literal type that must converge
  // with the PLAIN type-first `${number}`. The UNANNOTATED builder type is
  // checked BOTH directions — the reverse (plain `number` → builder type) is the
  // regression guard for the format-brand leak (`Unbrand`): a branded placeholder
  // would reject plain `number` and fail here. A positive annotated assignment
  // alone would NOT catch it (branded ⊆ plain).
  const _tplBuilt = RT.templateLiteral(['api/user/', RT.number()]);
  const _tplFwd = (x: Static<typeof _tplBuilt>): `api/user/${number}` => x;
  const _tplRev = (x: `api/user/${number}`): Static<typeof _tplBuilt> => x;
  void _tplBuilt;
  void _tplFwd;
  void _tplRev;

  // Union + literal placeholders distribute exactly like the type-first form.
  const _tplUni: RunType<`${'a' | 'b'}-${number}`> = RT.templateLiteral([
    RT.union([RT.literal('a'), RT.literal('b')]),
    '-',
    RT.number(),
  ]);
  void _tplUni;
}

// Exact (invariant) type equality — `(<T>() => T extends A ? 1 : 2)` paired both
// ways is the standard trick: it holds ONLY when A and B are mutually identical,
// not merely assignable.
type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
function assertExact<A, B>(_ok: Exact<A, B>): void {
  void _ok;
}

function assertionsComposerExactInference(): void {
  // EXACT-type guards for the CompTimeArgs-branded composers. The positive
  // ASSIGNMENT checks in assertionsComposers/assertionsNewBuilders are necessary
  // but NOT sufficient for the variadic builders: function-parameter
  // contravariance lets a WIDENED `(...args: (string | number)[]) => R` pass as
  // `(a: string, b: number) => R`, and a widened tuple can slip through some
  // positions too. These pin the exact carried type, so a regression in the
  // `const T` / `const P` capture or in `MapTuple`'s `-readonly` — the
  // combination that keeps precise per-slot inference once the param is wrapped
  // in the `CompTimeArgs` brand intersection — fails HERE loudly instead of
  // silently degrading the structural id the scanner reads off the brand.
  const _tup = RT.tuple([RT.boolean(), RT.number()]);
  assertExact<Static<typeof _tup>, [boolean, number]>(true);

  const _tupOpt = RT.tuple([RT.number()], [RT.boolean()]);
  assertExact<Static<typeof _tupOpt>, [number, boolean?]>(true);

  const _tupRest = RT.tuple([RT.number()], RT.string());
  assertExact<Static<typeof _tupRest>, [number, ...string[]]>(true);

  // func array-overload: the contravariance trap lives here — only an exact
  // check catches a widened param tuple.
  const _fn = RT.func([RT.string(), RT.number()], RT.boolean());
  assertExact<Static<typeof _fn>, (a: string, b: number) => boolean>(true);

  const _fn0 = RT.func();
  assertExact<Static<typeof _fn0>, () => void>(true);

  // union keeps its spread `[...T]` (the `[number]` index flattens, so the brand
  // can't widen the member union) — pinned exact to lock that in.
  const _uni = RT.union([RT.boolean(), RT.literal('x')]);
  assertExact<Static<typeof _uni>, boolean | 'x'>(true);

  // array: the simple-generic shape stays exact under the brand.
  const _arr = RT.array(RT.boolean());
  assertExact<Static<typeof _arr>, boolean[]>(true);
}
