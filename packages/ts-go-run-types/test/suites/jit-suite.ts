// Shared validation suite — single source of truth for every
// behavioral assertion ported from mion's
// packages/run-types/src/nodes/**/*.spec.ts (atomic, collection,
// member, utility, native) plus the entries in
// packages/run-types/src/jitCompilers/serialization-suite.ts.
//
// Shape per case:
//   - `title`         human label used in test reports
//   - `description?`  optional note pinning a bug-flavor behavior
//   - `isType?`       thunk wrapping `createIsType<T>()` — the
//                     vite-plugin-runtypes plugin rewrites this call
//                     site at build time, injecting the runtype hash.
//                     Omit a thunk to opt a case out of the isType
//                     adapter (per-API thunks for getTypeErrors,
//                     prepareForJson, mock, … land alongside their
//                     own adapter files when those emits are ported).
//   - `getSamples`    pure data: valid + invalid arrays. Same samples
//                     drive every adapter — and a future docs renderer
//                     can consume them without spinning up a validator.
//
// Cases are organized by category at the top level:
//   ATOMIC / ARRAY / OBJECT / TUPLE / UNION / TEMPLATE_LITERAL /
//   NATIVE (Map / Set / Promise / Awaited) / UTILITY (Partial /
//   Required / Pick / Omit / Exclude / Extract / …).
// Each category has its own `describe(...)` block in the merged
// adapter file test/adapters/isType.test.ts that registers `it()`
// per active case + `it.todo()` per deferred case, with a per-block
// counter-guard test that catches drift between this file and the
// adapter.
//
// The literal-type variants (`literal_2`, `literal_a`, …) live
// under sibling ATOMIC keys since each literal flavour is a
// distinct case per mion's literal.spec.ts. noLiterals option
// variants are sibling `<key>_noLiterals` entries — the
// createIsType option threading is in place end-to-end.

import {
  createIsType,
  deserializeIsType,
  createGetTypeErrors,
  deserializeGetTypeErrors,
  createPrepareForJson,
  deserializePrepareForJson,
  createRestoreFromJson,
  deserializeRestoreFromJson,
  type IsTypeFn,
  type GetTypeErrorsFn,
  type RunTypeError,
  type PrepareForJsonFn,
  type RestoreFromJsonFn,
} from '@mionjs/ts-go-run-types';

/** One atomic-type case in the shared suite. */
export interface JitCase {
  title: string;
  description?: string;
  /** User-facing notes about isType validation behavior — surfaces
   *  in the auto-generated docs. Use for clarifications a consumer
   *  would want to know: TS-semantic divergences (e.g., `object`
   *  accepting arrays, function-typed props being skipped), edge
   *  cases the validator rejects despite passing `typeof` (NaN,
   *  Infinity, Invalid Date), and any non-obvious behavior. Prefix
   *  divergence-from-strict-TS notes with `TS DIVERGENCE:` for easy
   *  doc filtering. Single sentence → string; multiple distinct
   *  points → array. */
  isTypeNotes?: string | string[];
  /** Plugin-rewritten thunk returning the isType validator — STATIC
   *  form. Caller supplies `T` explicitly via the type argument. */
  isType?: () => IsTypeFn;
  /** Plugin-rewritten thunk returning the isType validator — REFLECT
   *  form. Calls `createIsType(value)` with a runtime value annotated
   *  to type T; the type checker infers T from the annotation, the
   *  value itself is discarded at runtime. Paired with `isType` per
   *  the CLAUDE.md "Marker test coverage rule" to verify both call
   *  shapes produce the same validator end-to-end. **/
  isTypeReflect?: () => IsTypeFn;
  /** Plugin-rewritten thunk returning the validator rebuilt from the
   *  serialized `JitCompiledFnData.code` body via
   *  `new Function('utl', code)(jitUtils)` — exercises the
   *  serialize → deserialize round-trip the over-the-wire cache uses.
   *  Same call shape as `isType` (static form). **/
  deserializeIsType?: () => IsTypeFn;
  /** Reflect-form companion to `deserializeIsType`. **/
  deserializeIsTypeReflect?: () => IsTypeFn;
  /** Plugin-rewritten thunk returning the getTypeErrors validator —
   *  STATIC form. Caller supplies `T` explicitly. Same dispatch and
   *  caching as `isType` but the validator returns `RunTypeError[]`
   *  instead of a boolean (matches mion's `JitFunctions.typeErrors`). */
  getTypeErrors?: () => GetTypeErrorsFn;
  /** Plugin-rewritten thunk returning the getTypeErrors validator —
   *  REFLECT form. `T` inferred from a runtime value's declared type. */
  getTypeErrorsReflect?: () => GetTypeErrorsFn;
  /** Plugin-rewritten thunk returning the getTypeErrors validator
   *  rebuilt from the serialized `JitCompiledFnData.code` body via
   *  `new Function('utl', code)(jitUtils)` — exercises the
   *  serialize → deserialize round-trip the over-the-wire cache uses.
   *  Same call shape as `getTypeErrors` (static form). */
  deserializeGetTypeErrors?: () => GetTypeErrorsFn;
  /** Reflect-form companion to `deserializeGetTypeErrors`. */
  deserializeGetTypeErrorsReflect?: () => GetTypeErrorsFn;
  /** Expected error arrays for invalid samples — index-parallel to
   *  `getSamples().invalid`. Outer array length must match
   *  `invalid.length`; entry i is the `RunTypeError[]` the validator
   *  should produce for `invalid[i]`. Valid samples always expect `[]`.
   *  Omit on cases that don't declare `getTypeErrors`. */
  getExpectedErrors?: () => RunTypeError[][];

  // ── JSON serializer / deserializer pair ────────────────────────
  // prepareForJson + restoreFromJson are paired: success is round-trip
  // equality, `restoreFromJson(JSON.parse(JSON.stringify(prepareForJson(v))))`
  // deep-equals v for every valid sample. No expected-output thunk.

  /** Plugin-rewritten thunk returning the prepareForJson transformer —
   *  STATIC form. Caller supplies `T` explicitly via the type argument. */
  prepareForJson?: () => PrepareForJsonFn;
  /** Plugin-rewritten thunk returning the prepareForJson transformer —
   *  REFLECT form. T inferred from a runtime value's declared type. */
  prepareForJsonReflect?: () => PrepareForJsonFn;
  /** Plugin-rewritten thunk returning the prepareForJson transformer
   *  rebuilt from the serialized `JitCompiledFnData.code` body via
   *  `new Function('utl', code)(jitUtils)` — exercises the
   *  serialize → deserialize round-trip the over-the-wire cache uses. */
  deserializePrepareForJson?: () => PrepareForJsonFn;
  /** Reflect-form companion to `deserializePrepareForJson`. */
  deserializePrepareForJsonReflect?: () => PrepareForJsonFn;
  /** Plugin-rewritten thunk returning the restoreFromJson transformer —
   *  STATIC form. */
  restoreFromJson?: () => RestoreFromJsonFn;
  /** Plugin-rewritten thunk returning the restoreFromJson transformer —
   *  REFLECT form. */
  restoreFromJsonReflect?: () => RestoreFromJsonFn;
  /** Plugin-rewritten thunk returning the restoreFromJson transformer
   *  rebuilt from the serialized body. */
  deserializeRestoreFromJson?: () => RestoreFromJsonFn;
  /** Reflect-form companion to `deserializeRestoreFromJson`. */
  deserializeRestoreFromJsonReflect?: () => RestoreFromJsonFn;
  /** Optional override for the valid samples used by the
   *  prepareForJson + restoreFromJson round-trip adapters. When the
   *  static type is too broad to preserve class info through JSON
   *  (e.g. `object` containing a Date — the type doesn't know to
   *  reconstruct), the case can declare a narrower sample set just for
   *  the round-trip tests. Defaults to `getSamples().valid` when
   *  undefined. **/
  getRoundTripValid?: () => unknown[];

  /** Pure sample data — same for every adapter. */
  getSamples: () => {valid: unknown[]; invalid: unknown[]};
}

export const JIT_SUITE = {
  ATOMIC: {
    any: {
      title: 'Any type — every value passes',
      isTypeNotes: 'No-op validator — every value passes. Equivalent to `() => true`.',
      isType: () => createIsType<any>(),
      deserializeIsType: () => deserializeIsType<any>(),
      isTypeReflect: () => {
        const v: any = null;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: any = null;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<any>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<any>(),
      getTypeErrorsReflect: () => {
        const v: any = null;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: any = null;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<any>(),
      deserializePrepareForJson: () => deserializePrepareForJson<any>(),
      prepareForJsonReflect: () => {
        const v: any = null;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: any = null;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<any>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<any>(),
      restoreFromJsonReflect: () => {
        const v: any = null;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: any = null;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [null, undefined, 42, 'hello'],
        invalid: [],
      }),
      getExpectedErrors: () => [],
    },

    bigint: {
      title: 'BigInt primitive',
      description: 'Infinity and -Infinity rejected (typeof gate)',
      isType: () => createIsType<bigint>(),
      deserializeIsType: () => deserializeIsType<bigint>(),
      isTypeReflect: () => {
        const v: bigint = 1n;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: bigint = 1n;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<bigint>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<bigint>(),
      getTypeErrorsReflect: () => {
        const v: bigint = 1n;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: bigint = 1n;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<bigint>(),
      deserializePrepareForJson: () => deserializePrepareForJson<bigint>(),
      prepareForJsonReflect: () => {
        const v: bigint = 1n;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: bigint = 1n;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<bigint>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<bigint>(),
      restoreFromJsonReflect: () => {
        const v: bigint = 1n;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: bigint = 1n;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [1n, BigInt(42)],
        invalid: [42, Infinity, -Infinity, 'hello', null, undefined, true],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'bigint'}],
        [{path: [], expected: 'bigint'}],
        [{path: [], expected: 'bigint'}],
        [{path: [], expected: 'bigint'}],
        [{path: [], expected: 'bigint'}],
        [{path: [], expected: 'bigint'}],
        [{path: [], expected: 'bigint'}],
      ],
    },

    boolean: {
      title: 'Boolean primitive (strict typeof)',
      isTypeNotes:
        'Strict typeof === "boolean". Truthy/falsy values that are not actual booleans (e.g., 0, 1, "", "true") are rejected.',
      isType: () => createIsType<boolean>(),
      deserializeIsType: () => deserializeIsType<boolean>(),
      isTypeReflect: () => {
        const v: boolean = true;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: boolean = true;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<boolean>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<boolean>(),
      getTypeErrorsReflect: () => {
        const v: boolean = true;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: boolean = true;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<boolean>(),
      deserializePrepareForJson: () => deserializePrepareForJson<boolean>(),
      prepareForJsonReflect: () => {
        const v: boolean = true;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: boolean = true;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<boolean>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<boolean>(),
      restoreFromJsonReflect: () => {
        const v: boolean = true;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: boolean = true;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [true, false],
        invalid: [42, 'hello', 0, 1, null, undefined],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
      ],
    },

    date: {
      title: 'Date instance (rejects Invalid Date)',
      description: 'Invalid Date instances (getTime() === NaN) rejected',
      isTypeNotes: [
        'Must be an actual Date instance (instanceof Date).',
        'Invalid Date instances are rejected — e.g., `new Date("not-a-date")` or `new Date(NaN)`, whose `.getTime()` returns NaN.',
      ],
      isType: () => createIsType<Date>(),
      deserializeIsType: () => deserializeIsType<Date>(),
      isTypeReflect: () => {
        const v: Date = new Date();
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Date = new Date();
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Date>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Date>(),
      getTypeErrorsReflect: () => {
        const v: Date = new Date();
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Date = new Date();
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<Date>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Date>(),
      prepareForJsonReflect: () => {
        const v: Date = new Date();
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: Date = new Date();
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<Date>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Date>(),
      restoreFromJsonReflect: () => {
        const v: Date = new Date();
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: Date = new Date();
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [new Date()],
        invalid: ['hello', new Date('invalid'), new Date(NaN)],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'date'}],
        [{path: [], expected: 'date'}],
        [{path: [], expected: 'date'}],
      ],
    },

    enum_mixed: {
      title: 'Enum with mixed numeric and string members',
      description: 'enum Color {Red, Green="green", Blue=2} — numeric reverse-mapping + string values',
      isTypeNotes: [
        'Validator accepts the underlying enum VALUES (0, "green", 2 for Color {Red, Green="green", Blue=2}).',
        'Enum member NAMES as strings ("Red", "Green", "Blue") are NOT accepted — these are TS-only handles, not runtime values.',
      ],
      isType: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        return createIsType<Color>();
      },
      deserializeIsType: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        return deserializeIsType<Color>();
      },
      isTypeReflect: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        const v: Color = Color.Red;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        const v: Color = Color.Red;
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        return createGetTypeErrors<Color>();
      },
      deserializeGetTypeErrors: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        return deserializeGetTypeErrors<Color>();
      },
      getTypeErrorsReflect: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        const v: Color = Color.Red;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        const v: Color = Color.Red;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        return createPrepareForJson<Color>();
      },
      deserializePrepareForJson: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        return deserializePrepareForJson<Color>();
      },
      prepareForJsonReflect: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        const v: Color = Color.Red;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        const v: Color = Color.Red;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        return createRestoreFromJson<Color>();
      },
      deserializeRestoreFromJson: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        return deserializeRestoreFromJson<Color>();
      },
      restoreFromJsonReflect: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        const v: Color = Color.Red;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        const v: Color = Color.Red;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => {
        enum Color {
          Red,
          Green = 'green',
          Blue = 2,
        }
        return {
          valid: [Color.Red, Color.Green, Color.Blue, 0, 'green', 2],
          invalid: ['Red', 'Green', 'Blue', 4, 1, 3, true, null, {}],
        };
      },
      getExpectedErrors: () => [
        [{path: [], expected: 'enum'}],
        [{path: [], expected: 'enum'}],
        [{path: [], expected: 'enum'}],
        [{path: [], expected: 'enum'}],
        [{path: [], expected: 'enum'}],
        [{path: [], expected: 'enum'}],
        [{path: [], expected: 'enum'}],
        [{path: [], expected: 'enum'}],
        [{path: [], expected: 'enum'}],
      ],
    },

    literal_2: {
      title: 'Numeric literal type (strict equality)',
      isTypeNotes: 'Strict === equality with the literal value. The string "2" is not the number 2.',
      isType: () => createIsType<2>(),
      deserializeIsType: () => deserializeIsType<2>(),
      isTypeReflect: () => {
        const v = 2 as const;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v = 2 as const;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<2>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<2>(),
      getTypeErrorsReflect: () => {
        const v = 2 as const;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v = 2 as const;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<2>(),
      deserializePrepareForJson: () => deserializePrepareForJson<2>(),
      prepareForJsonReflect: () => {
        const v = 2 as const;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v = 2 as const;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<2>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<2>(),
      restoreFromJsonReflect: () => {
        const v = 2 as const;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v = 2 as const;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({valid: [2], invalid: [4, '2', null, undefined]}),
      getExpectedErrors: () => [
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
      ],
    },

    literal_a: {
      title: 'String literal type (case-sensitive)',
      isTypeNotes: 'Case-sensitive — "A" does not satisfy the literal "a".',
      isType: () => createIsType<'a'>(),
      deserializeIsType: () => deserializeIsType<'a'>(),
      isTypeReflect: () => {
        const v = 'a' as const;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v = 'a' as const;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<'a'>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<'a'>(),
      getTypeErrorsReflect: () => {
        const v = 'a' as const;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v = 'a' as const;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<'a'>(),
      deserializePrepareForJson: () => deserializePrepareForJson<'a'>(),
      prepareForJsonReflect: () => {
        const v = 'a' as const;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v = 'a' as const;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<'a'>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<'a'>(),
      restoreFromJsonReflect: () => {
        const v = 'a' as const;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v = 'a' as const;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({valid: ['a'], invalid: ['b', 'A', '', null, undefined]}),
      getExpectedErrors: () => [
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
      ],
    },

    literal_regexp_simple: {
      title: 'RegExp literal type (matched by source plus flags)',
      isTypeNotes:
        'RegExp literal types are matched by source + flags, not by reference. A separate instance like `new RegExp("abc", "i")` would also pass; `/abc/` (missing flag) or `/abc/g` (different flag) does NOT.',
      isType: () => {
        const reg = /abc/i;
        return createIsType<typeof reg>();
      },
      deserializeIsType: () => {
        const reg = /abc/i;
        return deserializeIsType<typeof reg>();
      },
      isTypeReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        const reg = /abc/i;
        return createGetTypeErrors<typeof reg>();
      },
      deserializeGetTypeErrors: () => {
        const reg = /abc/i;
        return deserializeGetTypeErrors<typeof reg>();
      },
      getTypeErrorsReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        const reg = /abc/i;
        return createPrepareForJson<typeof reg>();
      },
      deserializePrepareForJson: () => {
        const reg = /abc/i;
        return deserializePrepareForJson<typeof reg>();
      },
      prepareForJsonReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        const reg = /abc/i;
        return createRestoreFromJson<typeof reg>();
      },
      deserializeRestoreFromJson: () => {
        const reg = /abc/i;
        return deserializeRestoreFromJson<typeof reg>();
      },
      restoreFromJsonReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({valid: [/abc/i], invalid: [/asdf/i, /abc/, /abc/g, 'abc']}),
      getExpectedErrors: () => [
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
      ],
    },

    literal_regexp_escaped: {
      title: 'RegExp literal with regex-metacharacters in the source',
      description: 'regexp with characters that can be problematic in jit code if not correctly scaped',
      isType: () => {
        const reg2 = /['"]\/ \\ \//;
        return createIsType<typeof reg2>();
      },
      deserializeIsType: () => {
        const reg2 = /['"]\/ \\ \//;
        return deserializeIsType<typeof reg2>();
      },
      isTypeReflect: () => {
        const reg2 = /['"]\/ \\ \//;
        const v: typeof reg2 = reg2;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const reg2 = /['"]\/ \\ \//;
        const v: typeof reg2 = reg2;
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        const reg2 = /['"]\/ \\ \//;
        return createGetTypeErrors<typeof reg2>();
      },
      deserializeGetTypeErrors: () => {
        const reg2 = /['"]\/ \\ \//;
        return deserializeGetTypeErrors<typeof reg2>();
      },
      getTypeErrorsReflect: () => {
        const reg2 = /['"]\/ \\ \//;
        const v: typeof reg2 = reg2;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const reg2 = /['"]\/ \\ \//;
        const v: typeof reg2 = reg2;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        const reg2 = /['"]\/ \\ \//;
        return createPrepareForJson<typeof reg2>();
      },
      deserializePrepareForJson: () => {
        const reg2 = /['"]\/ \\ \//;
        return deserializePrepareForJson<typeof reg2>();
      },
      prepareForJsonReflect: () => {
        const reg2 = /['"]\/ \\ \//;
        const v: typeof reg2 = reg2;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const reg2 = /['"]\/ \\ \//;
        const v: typeof reg2 = reg2;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        const reg2 = /['"]\/ \\ \//;
        return createRestoreFromJson<typeof reg2>();
      },
      deserializeRestoreFromJson: () => {
        const reg2 = /['"]\/ \\ \//;
        return deserializeRestoreFromJson<typeof reg2>();
      },
      restoreFromJsonReflect: () => {
        const reg2 = /['"]\/ \\ \//;
        const v: typeof reg2 = reg2;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const reg2 = /['"]\/ \\ \//;
        const v: typeof reg2 = reg2;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => {
        const reg2 = /['"]\/ \\ \//;
        return {
          valid: [/['"]\/ \\ \//, new RegExp(reg2.source, reg2.flags)],
          invalid: [true, null, undefined, '/'],
        };
      },
      getExpectedErrors: () => [
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
      ],
    },

    literal_true: {
      title: 'Boolean literal type (only true)',
      isTypeNotes:
        'Strict === equality. Truthy values like 1 or "true" do NOT satisfy the literal `true`; only the boolean true does.',
      isType: () => createIsType<true>(),
      deserializeIsType: () => deserializeIsType<true>(),
      isTypeReflect: () => {
        const v = true as const;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v = true as const;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<true>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<true>(),
      getTypeErrorsReflect: () => {
        const v = true as const;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v = true as const;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<true>(),
      deserializePrepareForJson: () => deserializePrepareForJson<true>(),
      prepareForJsonReflect: () => {
        const v = true as const;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v = true as const;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<true>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<true>(),
      restoreFromJsonReflect: () => {
        const v = true as const;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v = true as const;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({valid: [true], invalid: [false, 1, 'true', null]}),
      getExpectedErrors: () => [
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
      ],
    },

    literal_1n: {
      title: 'BigInt literal type (only 1n)',
      isTypeNotes: 'Strict === equality with the bigint literal. The number 1 and the string "1n" do NOT satisfy 1n.',
      isType: () => createIsType<1n>(),
      deserializeIsType: () => deserializeIsType<1n>(),
      isTypeReflect: () => {
        const v = 1n as const;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v = 1n as const;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<1n>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<1n>(),
      getTypeErrorsReflect: () => {
        const v = 1n as const;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v = 1n as const;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<1n>(),
      deserializePrepareForJson: () => deserializePrepareForJson<1n>(),
      prepareForJsonReflect: () => {
        const v = 1n as const;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v = 1n as const;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<1n>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<1n>(),
      restoreFromJsonReflect: () => {
        const v = 1n as const;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v = 1n as const;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({valid: [1n], invalid: [2n, 1, '1n', 0n, null]}),
      getExpectedErrors: () => [
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
      ],
    },

    literal_symbol: {
      title: 'Symbol literal type (matched by description)',
      description: 'symbol identity via description match (mion semantics)',
      isTypeNotes:
        'TS DIVERGENCE: Symbol literal types are matched by `description`, not by unique-symbol identity. A different `Symbol("hello")` instance with the same description WILL satisfy the type. Strict TS treats each `typeof sym` as a unique-symbol referring to that exact value.',
      isType: () => {
        const sym = Symbol('hello');
        return createIsType<typeof sym>();
      },
      deserializeIsType: () => {
        const sym = Symbol('hello');
        return deserializeIsType<typeof sym>();
      },
      isTypeReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        const sym = Symbol('hello');
        return createGetTypeErrors<typeof sym>();
      },
      deserializeGetTypeErrors: () => {
        const sym = Symbol('hello');
        return deserializeGetTypeErrors<typeof sym>();
      },
      getTypeErrorsReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        const sym = Symbol('hello');
        return createPrepareForJson<typeof sym>();
      },
      deserializePrepareForJson: () => {
        const sym = Symbol('hello');
        return deserializePrepareForJson<typeof sym>();
      },
      prepareForJsonReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        const sym = Symbol('hello');
        return createRestoreFromJson<typeof sym>();
      },
      deserializeRestoreFromJson: () => {
        const sym = Symbol('hello');
        return deserializeRestoreFromJson<typeof sym>();
      },
      restoreFromJsonReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => {
        const sym = Symbol('hello');
        return {
          // identity by description per mion semantics:
          // emit is `typeof === 'symbol' && v.description === 'hello'`
          valid: [sym, Symbol('hello')],
          invalid: [Symbol('nice'), 'hello', null, undefined],
        };
      },
      getExpectedErrors: () => [
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
        [{path: [], expected: 'literal'}],
      ],
    },

    never: {
      title: 'Never — no value passes',
      isTypeNotes: 'No value satisfies `never`. The validator is hard-coded to return `false` for every input.',
      isType: () => createIsType<never>(),
      deserializeIsType: () => deserializeIsType<never>(),
      isTypeReflect: () => {
        const v: never = null as never;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: never = null as never;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<never>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<never>(),
      getTypeErrorsReflect: () => {
        const v: never = null as never;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: never = null as never;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<never>(),
      deserializePrepareForJson: () => deserializePrepareForJson<never>(),
      prepareForJsonReflect: () => {
        const v: never = null as never;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: never = null as never;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<never>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<never>(),
      restoreFromJsonReflect: () => {
        const v: never = null as never;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: never = null as never;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [],
        invalid: [true, false, 1, '3', {}, 'hello', null, undefined, NaN, []],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'never'}],
        [{path: [], expected: 'never'}],
        [{path: [], expected: 'never'}],
        [{path: [], expected: 'never'}],
        [{path: [], expected: 'never'}],
        [{path: [], expected: 'never'}],
        [{path: [], expected: 'never'}],
        [{path: [], expected: 'never'}],
        [{path: [], expected: 'never'}],
        [{path: [], expected: 'never'}],
      ],
    },

    null: {
      title: 'Null primitive (distinct from undefined)',
      description: 'null and undefined are distinct',
      isTypeNotes:
        'Strict === null check. `undefined`, `0`, `""`, `false`, `NaN`, `{}`, `[]` and other "falsy" or "nullish-feeling" values are all rejected.',
      isType: () => createIsType<null>(),
      deserializeIsType: () => deserializeIsType<null>(),
      isTypeReflect: () => {
        const v: null = null;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: null = null;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<null>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<null>(),
      getTypeErrorsReflect: () => {
        const v: null = null;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: null = null;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<null>(),
      deserializePrepareForJson: () => deserializePrepareForJson<null>(),
      prepareForJsonReflect: () => {
        const v: null = null;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: null = null;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<null>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<null>(),
      restoreFromJsonReflect: () => {
        const v: null = null;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: null = null;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [null],
        invalid: [undefined, 42, 'hello', 0, '', false, NaN, {}, []],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'null'}],
        [{path: [], expected: 'null'}],
        [{path: [], expected: 'null'}],
        [{path: [], expected: 'null'}],
        [{path: [], expected: 'null'}],
        [{path: [], expected: 'null'}],
        [{path: [], expected: 'null'}],
        [{path: [], expected: 'null'}],
        [{path: [], expected: 'null'}],
      ],
    },

    number: {
      title: 'Number primitive (rejects NaN and Infinity)',
      description: 'Infinity and -Infinity rejected (Number.isFinite)',
      isTypeNotes: [
        'Uses `Number.isFinite(v)` rather than bare `typeof v === "number"`.',
        '`NaN`, `Infinity`, and `-Infinity` are rejected even though they pass `typeof === "number"`.',
      ],
      isType: () => createIsType<number>(),
      deserializeIsType: () => deserializeIsType<number>(),
      isTypeReflect: () => {
        const v: number = 42;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: number = 42;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<number>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<number>(),
      getTypeErrorsReflect: () => {
        const v: number = 42;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: number = 42;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<number>(),
      deserializePrepareForJson: () => deserializePrepareForJson<number>(),
      prepareForJsonReflect: () => {
        const v: number = 42;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: number = 42;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<number>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<number>(),
      restoreFromJsonReflect: () => {
        const v: number = 42;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: number = 42;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [42],
        invalid: [Infinity, -Infinity, NaN, 'hello', null, undefined],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'number'}],
        [{path: [], expected: 'number'}],
        [{path: [], expected: 'number'}],
        [{path: [], expected: 'number'}],
        [{path: [], expected: 'number'}],
        [{path: [], expected: 'number'}],
      ],
    },

    object: {
      title: 'Object type — any non-null non-primitive value',
      description: 'null rejected despite JS typeof null === "object"',
      isTypeNotes: [
        'Emit is `typeof v === "object" && v !== null` — strict TS semantics (any non-primitive non-null value).',
        'Arrays, Date instances, RegExp, Map, Set, and class instances all PASS — they are TS-`object` per the spec.',
        '`null` is explicitly rejected (despite `typeof null === "object"` in JavaScript).',
        '`object` here does NOT mean "plain object literal" — if you need that semantic, use a specific object shape or an index-signature type.',
      ],
      isType: () => createIsType<object>(),
      deserializeIsType: () => deserializeIsType<object>(),
      isTypeReflect: () => {
        const v: object = {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: object = {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<object>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<object>(),
      getTypeErrorsReflect: () => {
        const v: object = {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: object = {};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<object>(),
      deserializePrepareForJson: () => deserializePrepareForJson<object>(),
      prepareForJsonReflect: () => {
        const v: object = {};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: object = {};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<object>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<object>(),
      restoreFromJsonReflect: () => {
        const v: object = {};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: object = {};
        return deserializeRestoreFromJson(v);
      },
      // Static type `object` is too broad to preserve class info through
      // JSON: a Date sample round-trips to an ISO string (the validator
      // doesn't know to reconstruct), and a RegExp round-trips to `{}`
      // (RegExp has no toJSON). Restrict the round-trip set to plain
      // JSON-clean values; the isType / getTypeErrors adapters keep the
      // broader sample list.
      getRoundTripValid: () => [{}, {a: 42, b: 'hello'}, []],
      getSamples: () => ({
        valid: [{}, {a: 42, b: 'hello'}, [], new Date(), /abc/],
        invalid: [null, undefined, 42, 'hello', true, Symbol()],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    regexp: {
      title: 'RegExp instance',
      isTypeNotes:
        'Must be an actual RegExp instance (`instanceof RegExp`). A string like `"/abc/"` does NOT satisfy.',
      isType: () => createIsType<RegExp>(),
      deserializeIsType: () => deserializeIsType<RegExp>(),
      isTypeReflect: () => {
        const v: RegExp = /abc/;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: RegExp = /abc/;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<RegExp>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<RegExp>(),
      // Reflect thunks omitted: `const v: RegExp = /abc/` narrows to the
      // literal-regex type T = /abc/, which produces `expected: 'literal'`
      // instead of `'regexp'` and diverges from the static form. The
      // isType validator's body coincides for valid + invalid samples
      // so isType tests pass; typeErrors reports the kindname directly
      // and the divergence surfaces. Cases that DON'T narrow (Date,
      // symbol(...)) keep their reflect form.
      prepareForJson: () => createPrepareForJson<RegExp>(),
      deserializePrepareForJson: () => deserializePrepareForJson<RegExp>(),
      // Reflect thunks omitted for the same narrowing reason as getTypeErrors
      // above — `const v: RegExp = /abc/` narrows to the literal-regex type
      // and would dispatch to the regexp-literal arm instead.
      restoreFromJson: () => createRestoreFromJson<RegExp>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<RegExp>(),
      getSamples: () => ({
        valid: [/abc/, new RegExp('abc')],
        invalid: [undefined, 42, 'hello', null, '/abc/', {}],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'regexp'}],
        [{path: [], expected: 'regexp'}],
        [{path: [], expected: 'regexp'}],
        [{path: [], expected: 'regexp'}],
        [{path: [], expected: 'regexp'}],
        [{path: [], expected: 'regexp'}],
      ],
    },

    string: {
      title: 'String primitive',
      isTypeNotes: 'Strict typeof === "string". The empty string ("") is accepted.',
      isType: () => createIsType<string>(),
      deserializeIsType: () => deserializeIsType<string>(),
      isTypeReflect: () => {
        const v: string = 'hello';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: string = 'hello';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<string>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<string>(),
      getTypeErrorsReflect: () => {
        const v: string = 'hello';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: string = 'hello';
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<string>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string>(),
      prepareForJsonReflect: () => {
        const v: string = 'hello';
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: string = 'hello';
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<string>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string>(),
      restoreFromJsonReflect: () => {
        const v: string = 'hello';
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: string = 'hello';
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: ['hello', ''],
        invalid: [2, null, undefined, true],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
      ],
    },

    symbol: {
      title: 'Symbol primitive',
      isTypeNotes:
        'Strict typeof === "symbol". Accepts any symbol — keyed (`Symbol("foo")`), unkeyed (`Symbol()`), or well-known (`Symbol.iterator`). The literal string "symbol" is rejected.',
      isType: () => createIsType<symbol>(),
      deserializeIsType: () => deserializeIsType<symbol>(),
      isTypeReflect: () => {
        const v: symbol = Symbol();
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: symbol = Symbol();
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<symbol>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<symbol>(),
      getTypeErrorsReflect: () => {
        const v: symbol = Symbol();
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: symbol = Symbol();
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<symbol>(),
      deserializePrepareForJson: () => deserializePrepareForJson<symbol>(),
      prepareForJsonReflect: () => {
        const v: symbol = Symbol();
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: symbol = Symbol();
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<symbol>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<symbol>(),
      restoreFromJsonReflect: () => {
        const v: symbol = Symbol();
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: symbol = Symbol();
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [Symbol(), Symbol('foo')],
        invalid: [undefined, 42, 'hello', null, 'symbol', {}, true],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'symbol'}],
        [{path: [], expected: 'symbol'}],
        [{path: [], expected: 'symbol'}],
        [{path: [], expected: 'symbol'}],
        [{path: [], expected: 'symbol'}],
        [{path: [], expected: 'symbol'}],
        [{path: [], expected: 'symbol'}],
      ],
    },

    undefined: {
      title: 'Undefined primitive (distinct from null)',
      description: 'undefined and null are distinct',
      isTypeNotes: 'Strict === undefined check. `null`, `0`, `""`, `false`, `{}`, `[]` are all rejected.',
      isType: () => createIsType<undefined>(),
      deserializeIsType: () => deserializeIsType<undefined>(),
      isTypeReflect: () => {
        const v: undefined = undefined;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: undefined = undefined;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<undefined>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<undefined>(),
      getTypeErrorsReflect: () => {
        const v: undefined = undefined;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: undefined = undefined;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<undefined>(),
      deserializePrepareForJson: () => deserializePrepareForJson<undefined>(),
      prepareForJsonReflect: () => {
        const v: undefined = undefined;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: undefined = undefined;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<undefined>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<undefined>(),
      restoreFromJsonReflect: () => {
        const v: undefined = undefined;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: undefined = undefined;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [undefined],
        invalid: [null, 42, 'hello', 0, '', false, {}, []],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'undefined'}],
        [{path: [], expected: 'undefined'}],
        [{path: [], expected: 'undefined'}],
        [{path: [], expected: 'undefined'}],
        [{path: [], expected: 'undefined'}],
        [{path: [], expected: 'undefined'}],
        [{path: [], expected: 'undefined'}],
        [{path: [], expected: 'undefined'}],
      ],
    },

    void: {
      title: 'Void — accepts undefined, rejects null',
      description: 'void accepts undefined (and bare function return); rejects null',
      isType: () => createIsType<void>(),
      deserializeIsType: () => deserializeIsType<void>(),
      isTypeReflect: () => {
        const v: void = undefined;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: void = undefined;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<void>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<void>(),
      getTypeErrorsReflect: () => {
        const v: void = undefined;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: void = undefined;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<void>(),
      deserializePrepareForJson: () => deserializePrepareForJson<void>(),
      prepareForJsonReflect: () => {
        const v: void = undefined;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: void = undefined;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<void>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<void>(),
      restoreFromJsonReflect: () => {
        const v: void = undefined;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: void = undefined;
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => {
        function vd(): void {}
        return {
          valid: [undefined, vd()],
          invalid: [null, 42, 'hello'],
        };
      },
      getExpectedErrors: () => [
        [{path: [], expected: 'void'}],
        [{path: [], expected: 'void'}],
        [{path: [], expected: 'void'}],
      ],
    },

    // noLiterals variants — mirror the `noLiterals: true` block in
    // mion's literal.spec.ts. Each literal degrades to its base-type
    // check: the validator accepts any value of the base type instead
    // of only the exact literal. The Go-side resolver swaps the
    // literal type for its base via Checker_getBaseTypeOfLiteralType
    // before assigning the hash (see internal/resolver/scan.go), so
    // these cases reuse the existing base-kind emit code.

    literal_2_noLiterals: {
      title: 'Numeric literal with noLiterals (degrades to number)',
      description: 'degrades to number — Number.isFinite check',
      isTypeNotes:
        'With `{noLiterals: true}` the literal degrades to its base type (`number`). The exact-literal check is replaced by `Number.isFinite` — same rules as the atomic `number` validator (NaN / Infinity / -Infinity rejected).',
      isType: () => createIsType<2>(undefined, {noLiterals: true}),
      deserializeIsType: () => deserializeIsType<2>(undefined, {noLiterals: true}),
      isTypeReflect: () => {
        const v = 2 as const;
        return createIsType(v, {noLiterals: true});
      },
      deserializeIsTypeReflect: () => {
        const v = 2 as const;
        return deserializeIsType(v, {noLiterals: true});
      },
      getTypeErrors: () => createGetTypeErrors<2>(undefined, {noLiterals: true}),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<2>(undefined, {noLiterals: true}),
      getTypeErrorsReflect: () => {
        const v = 2 as const;
        return createGetTypeErrors(v, {noLiterals: true});
      },
      deserializeGetTypeErrorsReflect: () => {
        const v = 2 as const;
        return deserializeGetTypeErrors(v, {noLiterals: true});
      },
      prepareForJson: () => createPrepareForJson<2>(undefined, {noLiterals: true}),
      deserializePrepareForJson: () => deserializePrepareForJson<2>(undefined, {noLiterals: true}),
      prepareForJsonReflect: () => {
        const v = 2 as const;
        return createPrepareForJson(v, {noLiterals: true});
      },
      deserializePrepareForJsonReflect: () => {
        const v = 2 as const;
        return deserializePrepareForJson(v, {noLiterals: true});
      },
      restoreFromJson: () => createRestoreFromJson<2>(undefined, {noLiterals: true}),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<2>(undefined, {noLiterals: true}),
      restoreFromJsonReflect: () => {
        const v = 2 as const;
        return createRestoreFromJson(v, {noLiterals: true});
      },
      deserializeRestoreFromJsonReflect: () => {
        const v = 2 as const;
        return deserializeRestoreFromJson(v, {noLiterals: true});
      },
      getSamples: () => ({valid: [4, 0, -1], invalid: ['4', Infinity, NaN, null]}),
      getExpectedErrors: () => [
        [{path: [], expected: 'number'}],
        [{path: [], expected: 'number'}],
        [{path: [], expected: 'number'}],
        [{path: [], expected: 'number'}],
      ],
    },

    literal_a_noLiterals: {
      title: 'String literal with noLiterals (degrades to string)',
      description: 'degrades to string — typeof check',
      isTypeNotes: '`{noLiterals: true}` degrades the literal to its base type `string`. Any string passes, including the empty string.',
      isType: () => createIsType<'a'>(undefined, {noLiterals: true}),
      deserializeIsType: () => deserializeIsType<'a'>(undefined, {noLiterals: true}),
      isTypeReflect: () => {
        const v = 'a' as const;
        return createIsType(v, {noLiterals: true});
      },
      deserializeIsTypeReflect: () => {
        const v = 'a' as const;
        return deserializeIsType(v, {noLiterals: true});
      },
      getTypeErrors: () => createGetTypeErrors<'a'>(undefined, {noLiterals: true}),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<'a'>(undefined, {noLiterals: true}),
      getTypeErrorsReflect: () => {
        const v = 'a' as const;
        return createGetTypeErrors(v, {noLiterals: true});
      },
      deserializeGetTypeErrorsReflect: () => {
        const v = 'a' as const;
        return deserializeGetTypeErrors(v, {noLiterals: true});
      },
      prepareForJson: () => createPrepareForJson<'a'>(undefined, {noLiterals: true}),
      deserializePrepareForJson: () => deserializePrepareForJson<'a'>(undefined, {noLiterals: true}),
      prepareForJsonReflect: () => {
        const v = 'a' as const;
        return createPrepareForJson(v, {noLiterals: true});
      },
      deserializePrepareForJsonReflect: () => {
        const v = 'a' as const;
        return deserializePrepareForJson(v, {noLiterals: true});
      },
      restoreFromJson: () => createRestoreFromJson<'a'>(undefined, {noLiterals: true}),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<'a'>(undefined, {noLiterals: true}),
      restoreFromJsonReflect: () => {
        const v = 'a' as const;
        return createRestoreFromJson(v, {noLiterals: true});
      },
      deserializeRestoreFromJsonReflect: () => {
        const v = 'a' as const;
        return deserializeRestoreFromJson(v, {noLiterals: true});
      },
      getSamples: () => ({valid: ['c', ''], invalid: [1, null, undefined, true]}),
      getExpectedErrors: () => [
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
      ],
    },

    literal_regexp_noLiterals: {
      title: 'RegExp literal with noLiterals (degrades to RegExp)',
      description: 'degrades to RegExp — instanceof check',
      isTypeNotes:
        '`{noLiterals: true}` degrades the literal to its base type `RegExp`. Any RegExp instance passes (constructor form `new RegExp(...)` included); source + flags are no longer matched.',
      isType: () => {
        const reg = /abc/i;
        return createIsType<typeof reg>(undefined, {noLiterals: true});
      },
      deserializeIsType: () => {
        const reg = /abc/i;
        return deserializeIsType<typeof reg>(undefined, {noLiterals: true});
      },
      isTypeReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return createIsType(v, {noLiterals: true});
      },
      deserializeIsTypeReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return deserializeIsType(v, {noLiterals: true});
      },
      getTypeErrors: () => {
        const reg = /abc/i;
        return createGetTypeErrors<typeof reg>(undefined, {noLiterals: true});
      },
      deserializeGetTypeErrors: () => {
        const reg = /abc/i;
        return deserializeGetTypeErrors<typeof reg>(undefined, {noLiterals: true});
      },
      getTypeErrorsReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return createGetTypeErrors(v, {noLiterals: true});
      },
      deserializeGetTypeErrorsReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return deserializeGetTypeErrors(v, {noLiterals: true});
      },
      prepareForJson: () => {
        const reg = /abc/i;
        return createPrepareForJson<typeof reg>(undefined, {noLiterals: true});
      },
      deserializePrepareForJson: () => {
        const reg = /abc/i;
        return deserializePrepareForJson<typeof reg>(undefined, {noLiterals: true});
      },
      prepareForJsonReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return createPrepareForJson(v, {noLiterals: true});
      },
      deserializePrepareForJsonReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return deserializePrepareForJson(v, {noLiterals: true});
      },
      restoreFromJson: () => {
        const reg = /abc/i;
        return createRestoreFromJson<typeof reg>(undefined, {noLiterals: true});
      },
      deserializeRestoreFromJson: () => {
        const reg = /abc/i;
        return deserializeRestoreFromJson<typeof reg>(undefined, {noLiterals: true});
      },
      restoreFromJsonReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return createRestoreFromJson(v, {noLiterals: true});
      },
      deserializeRestoreFromJsonReflect: () => {
        const reg = /abc/i;
        const v: typeof reg = reg;
        return deserializeRestoreFromJson(v, {noLiterals: true});
      },
      getSamples: () => ({valid: [/otherReg/, new RegExp('foo')], invalid: ['otherReg', null, undefined, {}]}),
      getExpectedErrors: () => [
        [{path: [], expected: 'regexp'}],
        [{path: [], expected: 'regexp'}],
        [{path: [], expected: 'regexp'}],
        [{path: [], expected: 'regexp'}],
      ],
    },

    literal_true_noLiterals: {
      title: 'Boolean literal with noLiterals (degrades to boolean)',
      description: 'degrades to boolean — typeof check',
      isTypeNotes:
        '`{noLiterals: true}` degrades the literal to its base type `boolean`. Either `true` or `false` passes; truthy values like 1 are still rejected.',
      isType: () => createIsType<true>(undefined, {noLiterals: true}),
      deserializeIsType: () => deserializeIsType<true>(undefined, {noLiterals: true}),
      isTypeReflect: () => {
        const v = true as const;
        return createIsType(v, {noLiterals: true});
      },
      deserializeIsTypeReflect: () => {
        const v = true as const;
        return deserializeIsType(v, {noLiterals: true});
      },
      getTypeErrors: () => createGetTypeErrors<true>(undefined, {noLiterals: true}),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<true>(undefined, {noLiterals: true}),
      getTypeErrorsReflect: () => {
        const v = true as const;
        return createGetTypeErrors(v, {noLiterals: true});
      },
      deserializeGetTypeErrorsReflect: () => {
        const v = true as const;
        return deserializeGetTypeErrors(v, {noLiterals: true});
      },
      prepareForJson: () => createPrepareForJson<true>(undefined, {noLiterals: true}),
      deserializePrepareForJson: () => deserializePrepareForJson<true>(undefined, {noLiterals: true}),
      prepareForJsonReflect: () => {
        const v = true as const;
        return createPrepareForJson(v, {noLiterals: true});
      },
      deserializePrepareForJsonReflect: () => {
        const v = true as const;
        return deserializePrepareForJson(v, {noLiterals: true});
      },
      restoreFromJson: () => createRestoreFromJson<true>(undefined, {noLiterals: true}),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<true>(undefined, {noLiterals: true}),
      restoreFromJsonReflect: () => {
        const v = true as const;
        return createRestoreFromJson(v, {noLiterals: true});
      },
      deserializeRestoreFromJsonReflect: () => {
        const v = true as const;
        return deserializeRestoreFromJson(v, {noLiterals: true});
      },
      getSamples: () => ({valid: [false, true], invalid: [1, 0, 'true', null, undefined]}),
      getExpectedErrors: () => [
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
      ],
    },

    literal_1n_noLiterals: {
      title: 'BigInt literal with noLiterals (degrades to bigint)',
      description: 'degrades to bigint — typeof check',
      isTypeNotes: '`{noLiterals: true}` degrades the literal to its base type `bigint`. Any bigint passes; the number `1` does NOT.',
      isType: () => createIsType<1n>(undefined, {noLiterals: true}),
      deserializeIsType: () => deserializeIsType<1n>(undefined, {noLiterals: true}),
      isTypeReflect: () => {
        const v = 1n as const;
        return createIsType(v, {noLiterals: true});
      },
      deserializeIsTypeReflect: () => {
        const v = 1n as const;
        return deserializeIsType(v, {noLiterals: true});
      },
      getTypeErrors: () => createGetTypeErrors<1n>(undefined, {noLiterals: true}),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<1n>(undefined, {noLiterals: true}),
      getTypeErrorsReflect: () => {
        const v = 1n as const;
        return createGetTypeErrors(v, {noLiterals: true});
      },
      deserializeGetTypeErrorsReflect: () => {
        const v = 1n as const;
        return deserializeGetTypeErrors(v, {noLiterals: true});
      },
      prepareForJson: () => createPrepareForJson<1n>(undefined, {noLiterals: true}),
      deserializePrepareForJson: () => deserializePrepareForJson<1n>(undefined, {noLiterals: true}),
      prepareForJsonReflect: () => {
        const v = 1n as const;
        return createPrepareForJson(v, {noLiterals: true});
      },
      deserializePrepareForJsonReflect: () => {
        const v = 1n as const;
        return deserializePrepareForJson(v, {noLiterals: true});
      },
      restoreFromJson: () => createRestoreFromJson<1n>(undefined, {noLiterals: true}),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<1n>(undefined, {noLiterals: true}),
      restoreFromJsonReflect: () => {
        const v = 1n as const;
        return createRestoreFromJson(v, {noLiterals: true});
      },
      deserializeRestoreFromJsonReflect: () => {
        const v = 1n as const;
        return deserializeRestoreFromJson(v, {noLiterals: true});
      },
      getSamples: () => ({valid: [3n, 0n, 1n], invalid: [3, null, undefined, 1, '1n']}),
      getExpectedErrors: () => [
        [{path: [], expected: 'bigint'}],
        [{path: [], expected: 'bigint'}],
        [{path: [], expected: 'bigint'}],
        [{path: [], expected: 'bigint'}],
        [{path: [], expected: 'bigint'}],
      ],
    },

    literal_symbol_noLiterals: {
      title: 'Symbol literal with noLiterals (degrades to symbol)',
      description: 'degrades to symbol — typeof check',
      isTypeNotes:
        '`{noLiterals: true}` degrades the literal to its base type `symbol`. The description-match is dropped — any symbol value passes.',
      isType: () => {
        const sym = Symbol('hello');
        return createIsType<typeof sym>(undefined, {noLiterals: true});
      },
      deserializeIsType: () => {
        const sym = Symbol('hello');
        return deserializeIsType<typeof sym>(undefined, {noLiterals: true});
      },
      isTypeReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return createIsType(v, {noLiterals: true});
      },
      deserializeIsTypeReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return deserializeIsType(v, {noLiterals: true});
      },
      getTypeErrors: () => {
        const sym = Symbol('hello');
        return createGetTypeErrors<typeof sym>(undefined, {noLiterals: true});
      },
      deserializeGetTypeErrors: () => {
        const sym = Symbol('hello');
        return deserializeGetTypeErrors<typeof sym>(undefined, {noLiterals: true});
      },
      getTypeErrorsReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return createGetTypeErrors(v, {noLiterals: true});
      },
      deserializeGetTypeErrorsReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return deserializeGetTypeErrors(v, {noLiterals: true});
      },
      prepareForJson: () => {
        const sym = Symbol('hello');
        return createPrepareForJson<typeof sym>(undefined, {noLiterals: true});
      },
      deserializePrepareForJson: () => {
        const sym = Symbol('hello');
        return deserializePrepareForJson<typeof sym>(undefined, {noLiterals: true});
      },
      prepareForJsonReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return createPrepareForJson(v, {noLiterals: true});
      },
      deserializePrepareForJsonReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return deserializePrepareForJson(v, {noLiterals: true});
      },
      restoreFromJson: () => {
        const sym = Symbol('hello');
        return createRestoreFromJson<typeof sym>(undefined, {noLiterals: true});
      },
      deserializeRestoreFromJson: () => {
        const sym = Symbol('hello');
        return deserializeRestoreFromJson<typeof sym>(undefined, {noLiterals: true});
      },
      restoreFromJsonReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return createRestoreFromJson(v, {noLiterals: true});
      },
      deserializeRestoreFromJsonReflect: () => {
        const sym = Symbol('hello');
        const v: typeof sym = sym;
        return deserializeRestoreFromJson(v, {noLiterals: true});
      },
      getSamples: () => ({
        valid: [Symbol('world'), Symbol(), Symbol.iterator],
        invalid: ['world', null, undefined, 'symbol'],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'symbol'}],
        [{path: [], expected: 'symbol'}],
        [{path: [], expected: 'symbol'}],
        [{path: [], expected: 'symbol'}],
      ],
    },

    // `unknown` — like `any`, every value passes. UnknownRunType
    // extends AnyRunType in mion (no isType emit), so both kinds
    // collapse to a noop validator. Mion's own suite skips this; we
    // include it here for full TS keyword coverage so a regression
    // can't silently change the always-pass semantics.
    unknown: {
      title: 'Unknown type — every value passes',
      isTypeNotes: 'No-op validator — `unknown` accepts every value, same as `any`. Equivalent to `() => true`.',
      isType: () => createIsType<unknown>(),
      deserializeIsType: () => deserializeIsType<unknown>(),
      isTypeReflect: () => {
        const v: unknown = null;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: unknown = null;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<unknown>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<unknown>(),
      getTypeErrorsReflect: () => {
        const v: unknown = null;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: unknown = null;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<unknown>(),
      deserializePrepareForJson: () => deserializePrepareForJson<unknown>(),
      prepareForJsonReflect: () => {
        const v: unknown = null;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: unknown = null;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<unknown>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<unknown>(),
      restoreFromJsonReflect: () => {
        const v: unknown = null;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: unknown = null;
        return deserializeRestoreFromJson(v);
      },
      // Static type `unknown` is too broad to preserve class info (Date,
      // Symbol, function) through a JSON round-trip — same rationale as
      // `object`. Restrict the round-trip samples to JSON-clean values.
      getRoundTripValid: () => [null, undefined, 42, 'hello', true, {}, []],
      getSamples: () => ({
        valid: [null, undefined, 42, 'hello', true, {}, [], Symbol(), () => null, new Date()],
        invalid: [],
      }),
      getExpectedErrors: () => [],
    },
  },

  // ARRAY — ported from mion's packages/run-types/src/nodes/member/array.spec.ts
  // (every `it()` block's `validate(…)` assertion is migrated, including
  // those embedded in non-isType blocks such as `hasUnknownKeys`, `mock`,
  // and `stripUnknownKeys`), plus every `ARRAYS.*` entry in
  // packages/run-types/src/jitCompilers/serialization-suite.ts that affects
  // isType behavior.
  //
  // Cases whose element kind isn't yet implemented in the Go port
  // (object literal / union / tuple / non-Date class / circular) omit
  // the `isType` thunk; the adapter renders them as `it.todo` so the
  // sample payloads survive intact for activation when each kind lands.
  //
  // Adapters out of scope for this PR (each has its own future test file
  // re-importing this suite):
  //   - mock          → mion array.spec.ts "mock" / "mock CircularArray"
  //   - typeErrors    → mion array.spec.ts "+ errors" variants
  //   - hasUnknownKeys / strip / undefined / visitUnknownKeyErrors
  //                   → mion array.spec.ts "test array strict modes"
  //   - prepareForJson / restoreFromJson / JSON round-trip
  //                   → mion jitCompilers/json/jsonSpec/02JsonArrays.spec.ts
  ARRAY: {
    string_array: {
      title: 'Array of strings',
      isTypeNotes: [
        'Top-level value must be an actual array (`Array.isArray`).',
        'Every element must satisfy the element type — the empty array `[]` is valid.',
      ],
      isType: () => createIsType<string[]>(),
      deserializeIsType: () => deserializeIsType<string[]>(),
      isTypeReflect: () => {
        const v: string[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: string[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<string[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<string[]>(),
      getTypeErrorsReflect: () => {
        const v: string[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: string[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<string[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string[]>(),
      prepareForJsonReflect: () => {
        const v: string[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: string[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<string[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string[]>(),
      restoreFromJsonReflect: () => {
        const v: string[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: string[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], ['hello', 'world']],
        // The mixed-types invalid `['hello', 'world', {hello: 'world'}]`
        // is the carry-over from mion's "simple array hasUnknownKeys on
        // array with non objects" block — the object element fails the
        // string check, so the whole array fails isType.
        invalid: ['hello', ['hello', 2], ['hello', 'world', {hello: 'world'}], null, undefined, [42], [null]],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'array'}],
        [{path: [1], expected: 'string'}],
        [{path: [2], expected: 'string'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'string'}],
        [{path: [0], expected: 'string'}],
      ],
    },

    number_array: {
      title: 'Array of numbers (rejects Infinity / NaN per element)',
      description: 'Infinity / -Infinity / NaN rejected per atomic-number port',
      isType: () => createIsType<number[]>(),
      deserializeIsType: () => deserializeIsType<number[]>(),
      isTypeReflect: () => {
        const v: number[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: number[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<number[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<number[]>(),
      getTypeErrorsReflect: () => {
        const v: number[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: number[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<number[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<number[]>(),
      prepareForJsonReflect: () => {
        const v: number[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: number[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<number[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<number[]>(),
      restoreFromJsonReflect: () => {
        const v: number[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: number[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], [1, 2, 3], [42]],
        invalid: [[1, '2'], 'not-array', [Infinity], [-Infinity], [NaN], null, undefined, [null], [BigInt(1)]],
      }),
      getExpectedErrors: () => [
        [{path: [1], expected: 'number'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'number'}],
        [{path: [0], expected: 'number'}],
        [{path: [0], expected: 'number'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'number'}],
        [{path: [0], expected: 'number'}],
      ],
    },

    boolean_array: {
      title: 'Array of booleans',
      isType: () => createIsType<boolean[]>(),
      deserializeIsType: () => deserializeIsType<boolean[]>(),
      isTypeReflect: () => {
        const v: boolean[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: boolean[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<boolean[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<boolean[]>(),
      getTypeErrorsReflect: () => {
        const v: boolean[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: boolean[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<boolean[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<boolean[]>(),
      prepareForJsonReflect: () => {
        const v: boolean[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: boolean[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<boolean[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<boolean[]>(),
      restoreFromJsonReflect: () => {
        const v: boolean[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: boolean[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], [true, false]],
        invalid: [[true, 42], 'nope', null, undefined, [0], [1], [null]],
      }),
      getExpectedErrors: () => [
        [{path: [1], expected: 'boolean'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'boolean'}],
        [{path: [0], expected: 'boolean'}],
        [{path: [0], expected: 'boolean'}],
      ],
    },

    bigint_array: {
      title: 'Array of bigints',
      isType: () => createIsType<bigint[]>(),
      deserializeIsType: () => deserializeIsType<bigint[]>(),
      isTypeReflect: () => {
        const v: bigint[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: bigint[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<bigint[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<bigint[]>(),
      getTypeErrorsReflect: () => {
        const v: bigint[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: bigint[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<bigint[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<bigint[]>(),
      prepareForJsonReflect: () => {
        const v: bigint[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: bigint[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<bigint[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<bigint[]>(),
      restoreFromJsonReflect: () => {
        const v: bigint[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: bigint[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], [1n, 2n]],
        invalid: [[1n, 2], 'nope', null, undefined, [null], [Infinity]],
      }),
      getExpectedErrors: () => [
        [{path: [1], expected: 'bigint'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'bigint'}],
        [{path: [0], expected: 'bigint'}],
      ],
    },

    date_array: {
      title: 'Array of Dates (rejects Invalid Date per element)',
      description: 'from mion serialization-suite ARRAYS.array_date',
      isTypeNotes: 'Each element goes through the atomic `Date` check — Invalid Date instances (`getTime() === NaN`) fail.',
      isType: () => createIsType<Date[]>(),
      deserializeIsType: () => deserializeIsType<Date[]>(),
      isTypeReflect: () => {
        const v: Date[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Date[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Date[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Date[]>(),
      getTypeErrorsReflect: () => {
        const v: Date[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Date[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<Date[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Date[]>(),
      prepareForJsonReflect: () => {
        const v: Date[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: Date[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<Date[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Date[]>(),
      restoreFromJsonReflect: () => {
        const v: Date[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: Date[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], [new Date('2000-08-06T02:13:00.000Z'), new Date('2001-09-07T03:14:00.000Z')]],
        invalid: [['2024'], [42], [new Date('invalid')], null, undefined],
      }),
      getExpectedErrors: () => [
        [{path: [0], expected: 'date'}],
        [{path: [0], expected: 'date'}],
        [{path: [0], expected: 'date'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
      ],
    },

    regexp_array: {
      title: 'Array of RegExps',
      isType: () => createIsType<RegExp[]>(),
      deserializeIsType: () => deserializeIsType<RegExp[]>(),
      isTypeReflect: () => {
        const v: RegExp[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: RegExp[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<RegExp[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<RegExp[]>(),
      getTypeErrorsReflect: () => {
        const v: RegExp[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: RegExp[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<RegExp[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<RegExp[]>(),
      prepareForJsonReflect: () => {
        const v: RegExp[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: RegExp[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<RegExp[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<RegExp[]>(),
      restoreFromJsonReflect: () => {
        const v: RegExp[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: RegExp[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], [/abc/, new RegExp('abc')]],
        invalid: [['/abc/'], [42], null, undefined, [null], [{}]],
      }),
      getExpectedErrors: () => [
        [{path: [0], expected: 'regexp'}],
        [{path: [0], expected: 'regexp'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'regexp'}],
        [{path: [0], expected: 'regexp'}],
      ],
    },

    undefined_array: {
      title: 'Array of undefined values',
      description: 'from mion serialization-suite ARRAYS.undefined_in_array',
      isTypeNotes: 'Every element must strictly === undefined. `null` and other falsy values are rejected per-element.',
      isType: () => createIsType<undefined[]>(),
      deserializeIsType: () => deserializeIsType<undefined[]>(),
      isTypeReflect: () => {
        const v: undefined[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: undefined[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<undefined[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<undefined[]>(),
      getTypeErrorsReflect: () => {
        const v: undefined[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: undefined[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<undefined[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<undefined[]>(),
      prepareForJsonReflect: () => {
        const v: undefined[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: undefined[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<undefined[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<undefined[]>(),
      restoreFromJsonReflect: () => {
        const v: undefined[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: undefined[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], [undefined, undefined]],
        invalid: [[null], [42], null, undefined, [0], [''], [false]],
      }),
      getExpectedErrors: () => [
        [{path: [0], expected: 'undefined'}],
        [{path: [0], expected: 'undefined'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'undefined'}],
        [{path: [0], expected: 'undefined'}],
        [{path: [0], expected: 'undefined'}],
      ],
    },

    null_array: {
      title: 'Array of nulls',
      isTypeNotes: 'Every element must strictly === null. `undefined` and other falsy values are rejected per-element.',
      isType: () => createIsType<null[]>(),
      deserializeIsType: () => deserializeIsType<null[]>(),
      isTypeReflect: () => {
        const v: null[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: null[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<null[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<null[]>(),
      getTypeErrorsReflect: () => {
        const v: null[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: null[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<null[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<null[]>(),
      prepareForJsonReflect: () => {
        const v: null[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: null[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<null[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<null[]>(),
      restoreFromJsonReflect: () => {
        const v: null[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: null[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], [null]],
        invalid: [[undefined], [42], null, undefined, [0], [''], [false]],
      }),
      getExpectedErrors: () => [
        [{path: [0], expected: 'null'}],
        [{path: [0], expected: 'null'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'null'}],
        [{path: [0], expected: 'null'}],
        [{path: [0], expected: 'null'}],
      ],
    },

    array_generic: {
      title: 'Generic Array<T> form (same emit as T[])',
      description: 'TypeScript sugar — resolves identically to string[]; carried as a regression check on canonical-id collapse',
      isType: () => createIsType<Array<string>>(),
      deserializeIsType: () => deserializeIsType<Array<string>>(),
      isTypeReflect: () => {
        const v: Array<string> = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Array<string> = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Array<string>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Array<string>>(),
      getTypeErrorsReflect: () => {
        const v: Array<string> = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Array<string> = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<Array<string>>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Array<string>>(),
      prepareForJsonReflect: () => {
        const v: Array<string> = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: Array<string> = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<Array<string>>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Array<string>>(),
      restoreFromJsonReflect: () => {
        const v: Array<string> = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: Array<string> = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], ['hello']],
        invalid: ['hello', [42], null, undefined],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'string'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
      ],
    },

    string_array_2d: {
      title: 'Two-dimensional string array (multi-level dependency call)',
      description:
        'first multi-level test — exercises the Go-side dependency-call layer (outer array invokes pre-compiled inner via utl.getJIT(...).fn(v[i0]))',
      isType: () => createIsType<string[][]>(),
      deserializeIsType: () => deserializeIsType<string[][]>(),
      isTypeReflect: () => {
        const v: string[][] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: string[][] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<string[][]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<string[][]>(),
      getTypeErrorsReflect: () => {
        const v: string[][] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: string[][] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<string[][]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string[][]>(),
      prepareForJsonReflect: () => {
        const v: string[][] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: string[][] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<string[][]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string[][]>(),
      restoreFromJsonReflect: () => {
        const v: string[][] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: string[][] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          [],
          [[]],
          [
            ['hello', 'world'],
            ['a', 'b'],
          ],
        ],
        // mion Block 5 path-error samples: top-level array-of-string
        // fails isType when the type is string[][], same for plain
        // string. `['hello']` is "first element is `'hello'` which is
        // not an array".
        invalid: [[['hello', 2]], ['hello'], ['hello', 'world'], 'hello', null, undefined, [[null]], [[42]]],
      }),
      getExpectedErrors: () => [
        [{path: [0, 1], expected: 'string'}],
        [{path: [0], expected: 'array'}],
        // `['hello', 'world']` — both elements fail the inner array
        // check; the loop walks every element and accumulates one error
        // per failure (mirror of mion's emitTypeErrors emitting per-
        // element callJitErr without early-exit).
        [
          {path: [0], expected: 'array'},
          {path: [1], expected: 'array'},
        ],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0, 0], expected: 'string'}],
        [{path: [0, 0], expected: 'string'}],
      ],
    },

    string_array_3d: {
      title: 'Three-dimensional string array (depth stress)',
      description: 'depth stress for the dependency-call layer',
      isType: () => createIsType<string[][][]>(),
      deserializeIsType: () => deserializeIsType<string[][][]>(),
      isTypeReflect: () => {
        const v: string[][][] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: string[][][] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<string[][][]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<string[][][]>(),
      getTypeErrorsReflect: () => {
        const v: string[][][] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: string[][][] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<string[][][]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string[][][]>(),
      prepareForJsonReflect: () => {
        const v: string[][][] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: string[][][] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<string[][][]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string[][][]>(),
      restoreFromJsonReflect: () => {
        const v: string[][][] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: string[][][] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], [[[]]], [[['a', 'b'], ['c']]]],
        invalid: [[[['a', 2]]], [['a']], ['a'], null, undefined, [[[null]]], [[[42]]]],
      }),
      getExpectedErrors: () => [
        // [[['a', 2]]] — inner-of-inner index 1 is non-string at [0,0,1]
        [{path: [0, 0, 1], expected: 'string'}],
        // [['a']] — second-level 'a' is not an array at [0,0]
        [{path: [0, 0], expected: 'array'}],
        // ['a'] — first-level 'a' is not an array at [0]
        [{path: [0], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0, 0, 0], expected: 'string'}],
        [{path: [0, 0, 0], expected: 'string'}],
      ],
    },

    string_array_noIsArrayCheck: {
      title: 'Array with noIsArrayCheck (Array.isArray guard stripped)',
      description:
        'noIsArrayCheck strips the Array.isArray guard; hashes distinctly from plain string_array — same samples, different validator',
      isTypeNotes: [
        'With `{noIsArrayCheck: true}`, the `Array.isArray` guard is stripped — non-array inputs may slip through.',
        'Use only when the caller has already verified the value is an array; the validator trusts the shape and only walks elements.',
      ],
      isType: () => createIsType<string[]>(undefined, {noIsArrayCheck: true}),
      deserializeIsType: () => deserializeIsType<string[]>(undefined, {noIsArrayCheck: true}),
      isTypeReflect: () => {
        const v: string[] = [];
        return createIsType(v, {noIsArrayCheck: true});
      },
      deserializeIsTypeReflect: () => {
        const v: string[] = [];
        return deserializeIsType(v, {noIsArrayCheck: true});
      },
      getTypeErrors: () => createGetTypeErrors<string[]>(undefined, {noIsArrayCheck: true}),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<string[]>(undefined, {noIsArrayCheck: true}),
      getTypeErrorsReflect: () => {
        const v: string[] = [];
        return createGetTypeErrors(v, {noIsArrayCheck: true});
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: string[] = [];
        return deserializeGetTypeErrors(v, {noIsArrayCheck: true});
      },
      prepareForJson: () => createPrepareForJson<string[]>(undefined, {noIsArrayCheck: true}),
      deserializePrepareForJson: () => deserializePrepareForJson<string[]>(undefined, {noIsArrayCheck: true}),
      prepareForJsonReflect: () => {
        const v: string[] = [];
        return createPrepareForJson(v, {noIsArrayCheck: true});
      },
      deserializePrepareForJsonReflect: () => {
        const v: string[] = [];
        return deserializePrepareForJson(v, {noIsArrayCheck: true});
      },
      restoreFromJson: () => createRestoreFromJson<string[]>(undefined, {noIsArrayCheck: true}),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string[]>(undefined, {noIsArrayCheck: true}),
      restoreFromJsonReflect: () => {
        const v: string[] = [];
        return createRestoreFromJson(v, {noIsArrayCheck: true});
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: string[] = [];
        return deserializeRestoreFromJson(v, {noIsArrayCheck: true});
      },
      getSamples: () => ({
        valid: [[], ['hello']],
        // Without the guard, non-array inputs may not be rejected by
        // the validator (mion's documented trade-off — the caller has
        // pre-verified arrayness). Only sample inputs that the loop
        // itself catches.
        invalid: [[42]],
      }),
      getExpectedErrors: () => [
        [{path: [0], expected: 'string'}],
      ],
    },

    // ---- DEFERRED — sample payloads carried for future activation ----

    object_array: {
      title: 'Array of object literals',
      description:
        "mion array.spec.ts 'test array strict modes' — array of objects. Extra keys on object elements still pass isType (unknown-key handling is a different adapter).",
      isType: () => createIsType<{a: string}[]>(),
      deserializeIsType: () => deserializeIsType<{a: string}[]>(),
      isTypeReflect: () => {
        const v: {a: string}[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {a: string}[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{a: string}[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string}[]>(),
      getTypeErrorsReflect: () => {
        const v: {a: string}[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {a: string}[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{a: string}[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{a: string}[]>(),
      prepareForJsonReflect: () => {
        const v: {a: string}[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {a: string}[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{a: string}[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{a: string}[]>(),
      restoreFromJsonReflect: () => {
        const v: {a: string}[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {a: string}[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], [{a: 'hello'}, {a: 'world'}], [{a: 'hello', extraA: 'extraA'}, {a: 'world'}]],
        invalid: ['not-an-array', [{a: 42}], [{}], [null], null, undefined, [{a: null}], [{a: undefined}]],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'array'}],
        [{path: [0, 'a'], expected: 'string'}],
        [{path: [0, 'a'], expected: 'string'}],
        [{path: [0], expected: 'objectLiteral'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0, 'a'], expected: 'string'}],
        [{path: [0, 'a'], expected: 'string'}],
      ],
    },

    union_array: {
      title: 'Array of unions (OR-chain per element)',
      description: 'array of union — each element validates against the union OR-chain.',
      isType: () => createIsType<(string | number)[]>(),
      deserializeIsType: () => deserializeIsType<(string | number)[]>(),
      isTypeReflect: () => {
        const v: (string | number)[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: (string | number)[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<(string | number)[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<(string | number)[]>(),
      getTypeErrorsReflect: () => {
        const v: (string | number)[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: (string | number)[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<(string | number)[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<(string | number)[]>(),
      prepareForJsonReflect: () => {
        const v: (string | number)[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: (string | number)[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<(string | number)[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<(string | number)[]>(),
      restoreFromJsonReflect: () => {
        const v: (string | number)[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: (string | number)[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], ['a', 1, 'b', 2], [1], ['a']],
        invalid: [[true], 'a', [null], ['a', true], null, undefined, [BigInt(1)], [Infinity]],
      }),
      getExpectedErrors: () => [
        // [true] — element 0 fails union (boolean not in string|number).
        [{path: [0], expected: 'union'}],
        // 'a' — not an array.
        [{path: [], expected: 'array'}],
        // [null] — element 0 fails union.
        [{path: [0], expected: 'union'}],
        // ['a', true] — element 1 (true) fails union; element 0 ('a') OK.
        [{path: [1], expected: 'union'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        // [BigInt(1)] — bigint not in union.
        [{path: [0], expected: 'union'}],
        // [Infinity] — Number.isFinite fails for Infinity (number arm
        // rejects it), bigint arm also fails → union fails.
        [{path: [0], expected: 'union'}],
      ],
    },

    tuple_array: {
      title: 'Array of tuples',
      description: 'array of tuples — exercises tuple under array dependency call.',
      isType: () => createIsType<[string, number][]>(),
      deserializeIsType: () => deserializeIsType<[string, number][]>(),
      isTypeReflect: () => {
        const v: [string, number][] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [string, number][] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[string, number][]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[string, number][]>(),
      getTypeErrorsReflect: () => {
        const v: [string, number][] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [string, number][] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[string, number][]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[string, number][]>(),
      prepareForJsonReflect: () => {
        const v: [string, number][] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [string, number][] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[string, number][]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[string, number][]>(),
      restoreFromJsonReflect: () => {
        const v: [string, number][] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [string, number][] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          [],
          [
            ['a', 1],
            ['b', 2],
          ],
        ],
        invalid: [[['a']], [['a', 'b']], 'not-array', [[1, 'a']], null, undefined, [['a', 1, 'extra']]],
      }),
      getExpectedErrors: () => [
        // [['a']] — outer at 0 is tuple ['a']. Slot 0 'a' OK; slot 1 undefined fails number → [0, 1].
        [{path: [0, 1], expected: 'number'}],
        // [['a', 'b']] — slot 1 'b' not number → [0, 1].
        [{path: [0, 1], expected: 'number'}],
        [{path: [], expected: 'array'}],
        // [[1, 'a']] — slot 0 1 not string, slot 1 'a' not number.
        [
          {path: [0, 0], expected: 'string'},
          {path: [0, 1], expected: 'number'},
        ],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        // [['a', 1, 'extra']] — length 3 > 2 → outer tuple check fails for element 0 → [0].
        [{path: [0], expected: 'tuple'}],
      ],
    },

    circular_array: {
      title: 'Self-referential array (CircularArray = CircularArray[])',
      description:
        "mion array.spec.ts 'Array circular ref'. Self-referential array — handled via the always-non-inlined KindArray policy plus the isSelf branch in EmitDependencyCall (emits the inner-function-name directly, no .fn).",
      isTypeNotes:
        'Self-referential arrays are validated recursively — depth is bounded only by the caller-supplied value, not the type definition.',
      isType: () => {
        type CircularArray = CircularArray[];
        return createIsType<CircularArray>();
      },
      deserializeIsType: () => {
        type CircularArray = CircularArray[];
        return deserializeIsType<CircularArray>();
      },
      isTypeReflect: () => {
        type CircularArray = CircularArray[];
        const v: CircularArray = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type CircularArray = CircularArray[];
        const v: CircularArray = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type CircularArray = CircularArray[];
        return createGetTypeErrors<CircularArray>();
      },
      deserializeGetTypeErrors: () => {
        type CircularArray = CircularArray[];
        return deserializeGetTypeErrors<CircularArray>();
      },
      getTypeErrorsReflect: () => {
        type CircularArray = CircularArray[];
        const v: CircularArray = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type CircularArray = CircularArray[];
        const v: CircularArray = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        type CircularArray = CircularArray[];
        return createPrepareForJson<CircularArray>();
      },
      deserializePrepareForJson: () => {
        type CircularArray = CircularArray[];
        return deserializePrepareForJson<CircularArray>();
      },
      prepareForJsonReflect: () => {
        type CircularArray = CircularArray[];
        const v: CircularArray = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        type CircularArray = CircularArray[];
        const v: CircularArray = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        type CircularArray = CircularArray[];
        return createRestoreFromJson<CircularArray>();
      },
      deserializeRestoreFromJson: () => {
        type CircularArray = CircularArray[];
        return deserializeRestoreFromJson<CircularArray>();
      },
      restoreFromJsonReflect: () => {
        type CircularArray = CircularArray[];
        const v: CircularArray = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        type CircularArray = CircularArray[];
        const v: CircularArray = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => {
        // type CircularArray = CircularArray[]; const arr: CircularArray = [[[[]]], [[]], []];
        const arrA: any = [];
        arrA.push([[[]]], [[]], []);
        return {
          valid: [[], arrA],
          invalid: [[[[]], 'A'], 'not array', null, undefined, [42], [[42]]],
        };
      },
      getExpectedErrors: () => [
        // [[[]], 'A'] — index 0 is a valid nested array; index 1 is 'A'
        // which fails the self-recurse array check at path [1].
        [{path: [1], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        // [42] — outer is array; element at index 0 is 42, which fails
        // the self-recurse array check at path [0].
        [{path: [0], expected: 'array'}],
        // [[42]] — outer is array; element at index 0 is [42] (still
        // array); inner-of-inner index 0 is 42 which fails at [0, 0].
        [{path: [0, 0], expected: 'array'}],
      ],
    },

    circular_object_with_array: {
      title: 'Recursive object whose cycle closes via an array property',
      description:
        'type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]} — same dependency-call mechanism as the basic circular interface; the array property d?: ObjectType[] closes the cycle via Array → Object.',
      isType: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        return createIsType<ObjectType>();
      },
      deserializeIsType: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        return deserializeIsType<ObjectType>();
      },
      isTypeReflect: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        const v: ObjectType = {a: 'hello'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        const v: ObjectType = {a: 'hello'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        return createGetTypeErrors<ObjectType>();
      },
      deserializeGetTypeErrors: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        return deserializeGetTypeErrors<ObjectType>();
      },
      getTypeErrorsReflect: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        const v: ObjectType = {a: 'hello'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        const v: ObjectType = {a: 'hello'};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        return createPrepareForJson<ObjectType>();
      },
      deserializePrepareForJson: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        return deserializePrepareForJson<ObjectType>();
      },
      prepareForJsonReflect: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        const v: ObjectType = {a: 'hello'};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        const v: ObjectType = {a: 'hello'};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        return createRestoreFromJson<ObjectType>();
      },
      deserializeRestoreFromJson: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        return deserializeRestoreFromJson<ObjectType>();
      },
      restoreFromJsonReflect: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        const v: ObjectType = {a: 'hello'};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        type ObjectType = {a: string; deep?: {b: string; c: number}; d?: ObjectType[]};
        const v: ObjectType = {a: 'hello'};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {a: 'hello'},
          {a: 'hello', deep: {b: 'world', c: 123}},
          {a: 'hello', d: [{a: 'world'}]},
          {a: 'hello', d: [{a: 'world', d: [{a: 'deep'}]}]},
        ],
        invalid: [
          {a: 42},
          'not-an-object',
          {a: 'hello', deep: {b: 1, c: 1}},
          {a: 'hello', d: 'not-array'},
          null,
          undefined,
          {a: 'hello', d: [null]},
          {a: 'hello', d: [{a: 42}]},
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['a'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['deep', 'b'], expected: 'string'}],
        [{path: ['d'], expected: 'array'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['d', 0], expected: 'objectLiteral'}],
        [{path: ['d', 0, 'a'], expected: 'string'}],
      ],
    },

    symbol_array: {
      title: 'Array of symbols (non-serializable — always rejected)',
      description:
        'mion ARRAYS.non_serializable_in_array — `Arrays can not have non serializable types` (nodes/member/array.ts:148). Mion throws at JIT compile time; we mirror the runtime-observable effect by emitting an always-false validator so any input is rejected.',
      isTypeNotes:
        'TS DIVERGENCE: Arrays whose element type is non-serializable (`symbol[]`, `(() => any)[]`, etc.) ALWAYS fail. The validator emits `return false`. Use a different shape if you need to carry symbol-like data.',
      isType: () => createIsType<symbol[]>(),
      deserializeIsType: () => deserializeIsType<symbol[]>(),
      isTypeReflect: () => {
        const v: symbol[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: symbol[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<symbol[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<symbol[]>(),
      getTypeErrorsReflect: () => {
        const v: symbol[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: symbol[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<symbol[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<symbol[]>(),
      prepareForJsonReflect: () => {
        const v: symbol[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: symbol[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<symbol[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<symbol[]>(),
      restoreFromJsonReflect: () => {
        const v: symbol[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: symbol[] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [],
        invalid: [[Symbol('a')], [], 'not array', null, [42]],
      }),
      // Non-serializable element type → typeErrors emits an
      // unconditional `[{expected: 'array'}]` error for every input
      // (mirrors the always-fail isType behaviour for this shape).
      getExpectedErrors: () => [
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
      ],
    },

    readonly_string_array: {
      title: 'Readonly array (ReadonlyArray<T> / readonly T[])',
      description:
        '`readonly T[]` and `ReadonlyArray<T>` are the same type at runtime — the readonly bit is a TS-only modifier erased at emit. Regression check that both forms produce the same validator as the bare `T[]` shape.',
      isTypeNotes:
        'Readonly modifier has NO runtime impact — the validator is identical to `T[]`. The compiler enforces readonly at write sites; the validator only checks the value shape.',
      isType: () => createIsType<ReadonlyArray<string>>(),
      deserializeIsType: () => deserializeIsType<ReadonlyArray<string>>(),
      isTypeReflect: () => {
        const v: ReadonlyArray<string> = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: ReadonlyArray<string> = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<ReadonlyArray<string>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<ReadonlyArray<string>>(),
      getTypeErrorsReflect: () => {
        const v: ReadonlyArray<string> = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: ReadonlyArray<string> = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<ReadonlyArray<string>>(),
      deserializePrepareForJson: () => deserializePrepareForJson<ReadonlyArray<string>>(),
      prepareForJsonReflect: () => {
        const v: ReadonlyArray<string> = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: ReadonlyArray<string> = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<ReadonlyArray<string>>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<ReadonlyArray<string>>(),
      restoreFromJsonReflect: () => {
        const v: ReadonlyArray<string> = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: ReadonlyArray<string> = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[], ['hello'], ['a', 'b', 'c']],
        invalid: ['not array', null, undefined, [42], [null]],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'string'}],
        [{path: [0], expected: 'string'}],
      ],
    },
  },

  // OBJECT — ports `isType` test coverage from mion's object-shape
  // node specs:
  //   - packages/run-types/src/nodes/collection/interface.spec.ts
  //   - packages/run-types/src/nodes/collection/class.spec.ts
  //   - packages/run-types/src/nodes/collection/classRpcError.spec.ts
  //   - packages/run-types/src/nodes/member/indexProperty.spec.ts
  //   - packages/run-types/src/nodes/member/callSignature.spec.ts
  //   - packages/run-types/src/nodes/collection/circularRefs.spec.ts
  //   - packages/run-types/src/jitCompilers/serialization-suite.ts
  //     (OBJECTS / RECORDS / FUNCTIONS sections — entries that touch
  //     interface, class, index signature, method, or call signature)
  // and the validate(...) sanity-check assertions embedded in the
  // adjacent `mock` / `hasUnknownKeys` / `stripUnknownKeys` blocks.
  //
  // Tests for non-isType adapters (mock, typeErrors, hasUnknownKeys,
  // prepareForJson, …) land in their own future adapter files; this
  // block carries ONLY the isType-relevant assertions but preserves
  // the sample shapes so a future adapter can re-import them.
  OBJECT: {
    simple_interface: {
      title: 'Simple interface with string and number props',
      description:
        'mion interface.spec.ts "validate object" (simplified to the atomic-prop subset that the current Go port can validate end-to-end)',
      isTypeNotes: [
        'Structural typing — extra properties beyond the declared shape PASS.',
        'Each declared property runs the atomic check for its type (number props reject NaN / Infinity).',
      ],
      isType: () => createIsType<{a: string; b: number}>(),
      deserializeIsType: () => deserializeIsType<{a: string; b: number}>(),
      isTypeReflect: () => {
        const v: {a: string; b: number} = {a: 'hello', b: 1};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {a: string; b: number} = {a: 'hello', b: 1};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{a: string; b: number}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string; b: number}>(),
      getTypeErrorsReflect: () => {
        const v: {a: string; b: number} = {a: 'hello', b: 1};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {a: string; b: number} = {a: 'hello', b: 1};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{a: string; b: number}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{a: string; b: number}>(),
      prepareForJsonReflect: () => {
        const v: {a: string; b: number} = {a: 'hello', b: 1};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {a: string; b: number} = {a: 'hello', b: 1};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{a: string; b: number}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{a: string; b: number}>(),
      restoreFromJsonReflect: () => {
        const v: {a: string; b: number} = {a: 'hello', b: 1};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {a: string; b: number} = {a: 'hello', b: 1};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {a: 'hello', b: 1},
          {a: '', b: 0},
          {a: 'x', b: 42, extra: true},
        ],
        invalid: [
          'hello',
          null,
          undefined,
          {a: 'x'},
          {a: 1, b: 1},
          {a: 'x', b: 'not number'},
          {a: 'x', b: NaN},
          {a: 'x', b: Infinity},
          {b: 1},
          true,
        ],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['b'], expected: 'number'}],
        [{path: ['a'], expected: 'string'}],
        [{path: ['b'], expected: 'number'}],
        [{path: ['b'], expected: 'number'}],
        [{path: ['b'], expected: 'number'}],
        [{path: ['a'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    object_as_const_literals: {
      title: 'Object pinned with `as const` (readonly literal props)',
      description:
        'Object literal pinned with `as const` — every property becomes a readonly literal type. Verifies that the type-id resolution and validator emit handle the readonly-literal-props shape end-to-end and that the static / reflect forms agree.',
      isTypeNotes:
        '`readonly` is erased at runtime. Every property must strictly === its literal value (name === "john", age === 30) — no looser matches.',
      isType: () => createIsType<{readonly name: 'john'; readonly age: 30}>(),
      deserializeIsType: () => deserializeIsType<{readonly name: 'john'; readonly age: 30}>(),
      isTypeReflect: () => {
        const Usr = {name: 'john', age: 30} as const;
        return createIsType(Usr);
      },
      deserializeIsTypeReflect: () => {
        const Usr = {name: 'john', age: 30} as const;
        return deserializeIsType(Usr);
      },
      getTypeErrors: () => createGetTypeErrors<{readonly name: 'john'; readonly age: 30}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{readonly name: 'john'; readonly age: 30}>(),
      getTypeErrorsReflect: () => {
        const Usr = {name: 'john', age: 30} as const;
        return createGetTypeErrors(Usr);
      },
      deserializeGetTypeErrorsReflect: () => {
        const Usr = {name: 'john', age: 30} as const;
        return deserializeGetTypeErrors(Usr);
      },
      prepareForJson: () => createPrepareForJson<{readonly name: 'john'; readonly age: 30}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{readonly name: 'john'; readonly age: 30}>(),
      prepareForJsonReflect: () => {
        const Usr = {name: 'john', age: 30} as const;
        return createPrepareForJson(Usr);
      },
      deserializePrepareForJsonReflect: () => {
        const Usr = {name: 'john', age: 30} as const;
        return deserializePrepareForJson(Usr);
      },
      restoreFromJson: () => createRestoreFromJson<{readonly name: 'john'; readonly age: 30}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{readonly name: 'john'; readonly age: 30}>(),
      restoreFromJsonReflect: () => {
        const Usr = {name: 'john', age: 30} as const;
        return createRestoreFromJson(Usr);
      },
      deserializeRestoreFromJsonReflect: () => {
        const Usr = {name: 'john', age: 30} as const;
        return deserializeRestoreFromJson(Usr);
      },
      getSamples: () => ({
        valid: [{name: 'john', age: 30}],
        invalid: [
          {name: 'jane', age: 30}, // name not the literal 'john'
          {name: 'john', age: 31}, // age not the literal 30
          {name: 'john'}, // missing age
          {age: 30}, // missing name
          {},
          null,
          'not object',
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['name'], expected: 'literal'}],
        [{path: ['age'], expected: 'literal'}],
        [{path: ['age'], expected: 'literal'}],
        [{path: ['name'], expected: 'literal'}],
        // {} — both props are missing; the for-each loop records one
        // error per declared prop (mion's emitTypeErrors per-property
        // accumulation).
        [
          {path: ['name'], expected: 'literal'},
          {path: ['age'], expected: 'literal'},
        ],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    object_via_return_type_utility: {
      title: 'Object inferred via ReturnType<typeof factory>',
      description:
        'Static-form usage of the recommended `ReturnType<typeof fn>` idiom when you have a factory function whose return type you want to validate. The reflect form `createIsType(makeUser())` would invoke the function at runtime purely for type inference — anti-pattern that the resolver now flags as a build-time warning. The reflect-form thunk is intentionally omitted; the diagnostic test in vite-plugin-runtypes covers the warning.',
      isTypeNotes:
        'Prefer the static form `createIsType<ReturnType<typeof fn>>()` over `createIsType(fn())` — the latter invokes the function at runtime just to infer its type. The build pipeline emits a warning for the function-call reflect pattern.',
      isType: () => {
        function makeUser(): {id: number; name: string} {
          return {id: 1, name: 'john'};
        }
        return createIsType<ReturnType<typeof makeUser>>();
      },
      deserializeIsType: () => {
        function makeUser(): {id: number; name: string} {
          return {id: 1, name: 'john'};
        }
        return deserializeIsType<ReturnType<typeof makeUser>>();
      },
      getTypeErrors: () => {
        function makeUser(): {id: number; name: string} {
          return {id: 1, name: 'john'};
        }
        return createGetTypeErrors<ReturnType<typeof makeUser>>();
      },
      deserializeGetTypeErrors: () => {
        function makeUser(): {id: number; name: string} {
          return {id: 1, name: 'john'};
        }
        return deserializeGetTypeErrors<ReturnType<typeof makeUser>>();
      },
      prepareForJson: () => {
        function makeUser(): {id: number; name: string} {
          return {id: 1, name: 'john'};
        }
        return createPrepareForJson<ReturnType<typeof makeUser>>();
      },
      deserializePrepareForJson: () => {
        function makeUser(): {id: number; name: string} {
          return {id: 1, name: 'john'};
        }
        return deserializePrepareForJson<ReturnType<typeof makeUser>>();
      },
      restoreFromJson: () => {
        function makeUser(): {id: number; name: string} {
          return {id: 1, name: 'john'};
        }
        return createRestoreFromJson<ReturnType<typeof makeUser>>();
      },
      deserializeRestoreFromJson: () => {
        function makeUser(): {id: number; name: string} {
          return {id: 1, name: 'john'};
        }
        return deserializeRestoreFromJson<ReturnType<typeof makeUser>>();
      },
      getSamples: () => ({
        valid: [
          {id: 1, name: 'john'},
          {id: 0, name: ''},
          {id: 42, name: 'jane', extra: true},
        ],
        invalid: [{id: 'not number', name: 'x'}, {id: 1}, {name: 'x'}, null, 'not object'],
      }),
      getExpectedErrors: () => [
        [{path: ['id'], expected: 'number'}],
        [{path: ['name'], expected: 'string'}],
        [{path: ['id'], expected: 'number'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    object_via_property_access: {
      title: 'Object inferred via property access on a parent shape',
      description:
        "Reflect form with a property-access argument (`createIsType(outer.user)`). T comes from the property's declared type on the parent shape — property accesses don't go through const-binding CFA, so the natural pattern produces the same hash as the static form.",
      isType: () => createIsType<{id: number; name: string}>(),
      deserializeIsType: () => deserializeIsType<{id: number; name: string}>(),
      isTypeReflect: () => {
        const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
        return createIsType(outer.user);
      },
      deserializeIsTypeReflect: () => {
        const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
        return deserializeIsType(outer.user);
      },
      getTypeErrors: () => createGetTypeErrors<{id: number; name: string}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{id: number; name: string}>(),
      getTypeErrorsReflect: () => {
        const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
        return createGetTypeErrors(outer.user);
      },
      deserializeGetTypeErrorsReflect: () => {
        const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
        return deserializeGetTypeErrors(outer.user);
      },
      prepareForJson: () => createPrepareForJson<{id: number; name: string}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{id: number; name: string}>(),
      prepareForJsonReflect: () => {
        const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
        return createPrepareForJson(outer.user);
      },
      deserializePrepareForJsonReflect: () => {
        const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
        return deserializePrepareForJson(outer.user);
      },
      restoreFromJson: () => createRestoreFromJson<{id: number; name: string}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{id: number; name: string}>(),
      restoreFromJsonReflect: () => {
        const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
        return createRestoreFromJson(outer.user);
      },
      deserializeRestoreFromJsonReflect: () => {
        const outer: {user: {id: number; name: string}} = {user: {id: 1, name: 'john'}};
        return deserializeRestoreFromJson(outer.user);
      },
      getSamples: () => ({
        valid: [
          {id: 1, name: 'john'},
          {id: 0, name: ''},
        ],
        invalid: [{id: 'not number', name: 'x'}, {id: 1}, null],
      }),
      getExpectedErrors: () => [
        [{path: ['id'], expected: 'number'}],
        [{path: ['name'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    object_via_array_access: {
      title: 'Object inferred via array element access',
      description:
        "Reflect form with an array-element-access argument (`createIsType(items[0])`). T comes from the array's declared element type — indexed accesses don't go through const-binding CFA, so the natural pattern produces the same hash as the static form.",
      isType: () => createIsType<{id: number; name: string}>(),
      deserializeIsType: () => deserializeIsType<{id: number; name: string}>(),
      isTypeReflect: () => {
        const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
        return createIsType(items[0]);
      },
      deserializeIsTypeReflect: () => {
        const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
        return deserializeIsType(items[0]);
      },
      getTypeErrors: () => createGetTypeErrors<{id: number; name: string}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{id: number; name: string}>(),
      getTypeErrorsReflect: () => {
        const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
        return createGetTypeErrors(items[0]);
      },
      deserializeGetTypeErrorsReflect: () => {
        const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
        return deserializeGetTypeErrors(items[0]);
      },
      prepareForJson: () => createPrepareForJson<{id: number; name: string}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{id: number; name: string}>(),
      prepareForJsonReflect: () => {
        const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
        return createPrepareForJson(items[0]);
      },
      deserializePrepareForJsonReflect: () => {
        const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
        return deserializePrepareForJson(items[0]);
      },
      restoreFromJson: () => createRestoreFromJson<{id: number; name: string}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{id: number; name: string}>(),
      restoreFromJsonReflect: () => {
        const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
        return createRestoreFromJson(items[0]);
      },
      deserializeRestoreFromJsonReflect: () => {
        const items: {id: number; name: string}[] = [{id: 1, name: 'john'}];
        return deserializeRestoreFromJson(items[0]);
      },
      getSamples: () => ({
        valid: [
          {id: 1, name: 'john'},
          {id: 0, name: ''},
        ],
        invalid: [{id: 'not number', name: 'x'}, {id: 1}, null],
      }),
      getExpectedErrors: () => [
        [{path: ['id'], expected: 'number'}],
        [{path: ['name'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    interface_with_optional: {
      title: 'Interface with one optional property',
      description: 'optional property — `(v.b === undefined || Number.isFinite(v.b))` per PropertyRunType.emitIsType',
      isTypeNotes:
        'Optional (`?`) properties may be missing OR explicitly `undefined`. If present, the value must satisfy the declared type — `b: NaN` still fails.',
      isType: () => createIsType<{a: string; b?: number}>(),
      deserializeIsType: () => deserializeIsType<{a: string; b?: number}>(),
      isTypeReflect: () => {
        const v: {a: string; b?: number} = {a: 'x'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {a: string; b?: number} = {a: 'x'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{a: string; b?: number}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string; b?: number}>(),
      getTypeErrorsReflect: () => {
        const v: {a: string; b?: number} = {a: 'x'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {a: string; b?: number} = {a: 'x'};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{a: string; b?: number}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{a: string; b?: number}>(),
      prepareForJsonReflect: () => {
        const v: {a: string; b?: number} = {a: 'x'};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {a: string; b?: number} = {a: 'x'};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{a: string; b?: number}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{a: string; b?: number}>(),
      restoreFromJsonReflect: () => {
        const v: {a: string; b?: number} = {a: 'x'};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {a: string; b?: number} = {a: 'x'};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{a: 'x'}, {a: 'x', b: 0}, {a: 'x', b: undefined}],
        invalid: [{a: 'x', b: 'not number'}, {a: 1}, null, undefined, {}, {b: 1}, {a: 'x', b: NaN}],
      }),
      getExpectedErrors: () => [
        [{path: ['b'], expected: 'number'}],
        [{path: ['a'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        // {} — only required prop `a` is checked; `b` is optional + undefined → skipped.
        [{path: ['a'], expected: 'string'}],
        // {b: 1} — `a` missing, `b` is 1 (passes since it's a finite number)
        [{path: ['a'], expected: 'string'}],
        [{path: ['b'], expected: 'number'}],
      ],
    },

    interface_with_date: {
      title: 'Interface with a Date property',
      description:
        'tests that Date child validates via instanceof inside the AND chain — mion interface.spec.ts ObjectType subset',
      isTypeNotes: 'Date-typed properties run the atomic `Date` check — Invalid Date instances inside the property fail too.',
      isType: () => createIsType<{date: Date; name: string}>(),
      deserializeIsType: () => deserializeIsType<{date: Date; name: string}>(),
      isTypeReflect: () => {
        const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{date: Date; name: string}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{date: Date; name: string}>(),
      getTypeErrorsReflect: () => {
        const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{date: Date; name: string}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{date: Date; name: string}>(),
      prepareForJsonReflect: () => {
        const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{date: Date; name: string}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{date: Date; name: string}>(),
      restoreFromJsonReflect: () => {
        const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {date: Date; name: string} = {date: new Date(), name: 'x'};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{date: new Date(), name: 'x'}],
        invalid: [
          {date: 'not date', name: 'x'},
          {date: new Date(), name: 1},
          {name: 'x'},
          null,
          undefined,
          {date: new Date('invalid'), name: 'x'},
          {date: new Date(NaN), name: 'x'},
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['date'], expected: 'date'}],
        [{path: ['name'], expected: 'string'}],
        [{path: ['date'], expected: 'date'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['date'], expected: 'date'}],
        [{path: ['date'], expected: 'date'}],
      ],
    },

    interface_with_method: {
      title: 'Interface with a method (function prop skipped from check)',
      description:
        "mion: objectSkipProps — function-typed properties are skipped from isType (mion's `getJitChild → undefined` for function children). validate({name:'x'}) PASSES even without `cb`.",
      isTypeNotes: [
        'TS DIVERGENCE: Function-typed properties are completely IGNORED by isType.',
        'The property may be absent, `undefined`, `null`, a number, a string — anything passes. Even a fresh function is fine.',
        'Rationale: function values cannot be serialized, so the validator (which gates serialization) treats them as out-of-scope.',
        'If you need to verify a function is actually callable, do it outside isType.',
      ],
      isType: () => createIsType<{name: string; cb: () => any}>(),
      deserializeIsType: () => deserializeIsType<{name: string; cb: () => any}>(),
      isTypeReflect: () => {
        const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{name: string; cb: () => any}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{name: string; cb: () => any}>(),
      getTypeErrorsReflect: () => {
        const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{name: string; cb: () => any}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{name: string; cb: () => any}>(),
      prepareForJsonReflect: () => {
        const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{name: string; cb: () => any}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{name: string; cb: () => any}>(),
      restoreFromJsonReflect: () => {
        const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {name: string; cb: () => any} = {name: 'x', cb: () => null};
        return deserializeRestoreFromJson(v);
      },
      // Function-typed `cb` is dropped by JSON.stringify (functions
      // become `undefined`), so the round-trip can't preserve the
      // original. The serializer correctly skips the function property
      // — the comparison-side reference also needs to skip it. Strip
      // `cb` from the round-trip samples; the validator adapters keep
      // the full sample list.
      getRoundTripValid: () => [{name: 'x'}, {name: 'x', cb: null}, {name: 'x', cb: 'not-a-fn'}],
      getSamples: () => ({
        valid: [
          {name: 'x'},
          {name: 'x', cb: () => null},
          {name: 'x', cb: 42},
          {name: 'x', cb: null},
          {name: 'x', cb: 'not-a-fn'},
        ],
        invalid: [{name: 1}, null, undefined],
      }),
      getExpectedErrors: () => [
        [{path: ['name'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    nested_object: {
      title: 'Interface with a nested object property',
      description: 'nested object — outer + inner AND-chains; mion ObjectType "deep" subset',
      isTypeNotes: 'Nested objects are validated recursively. Atomic-level rejections (NaN, Invalid Date) bubble up from the inner shape.',
      isType: () => createIsType<{a: string; deep: {b: string; c: number}}>(),
      deserializeIsType: () => deserializeIsType<{a: string; deep: {b: string; c: number}}>(),
      isTypeReflect: () => {
        const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{a: string; deep: {b: string; c: number}}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string; deep: {b: string; c: number}}>(),
      getTypeErrorsReflect: () => {
        const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{a: string; deep: {b: string; c: number}}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{a: string; deep: {b: string; c: number}}>(),
      prepareForJsonReflect: () => {
        const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{a: string; deep: {b: string; c: number}}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{a: string; deep: {b: string; c: number}}>(),
      restoreFromJsonReflect: () => {
        const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {a: string; deep: {b: string; c: number}} = {a: 'x', deep: {b: 'y', c: 1}};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{a: 'x', deep: {b: 'y', c: 1}}],
        invalid: [
          {a: 'x'},
          {a: 'x', deep: {b: 1, c: 1}},
          {a: 'x', deep: null},
          null,
          undefined,
          {a: 'x', deep: {b: 'y', c: NaN}},
          {a: 'x', deep: {b: 'y'}},
        ],
      }),
      getExpectedErrors: () => [
        // {a: 'x'} — missing 'deep' which is required → fails object check at ['deep']
        [{path: ['deep'], expected: 'objectLiteral'}],
        [{path: ['deep', 'b'], expected: 'string'}],
        [{path: ['deep'], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['deep', 'c'], expected: 'number'}],
        // {a:'x', deep:{b:'y'}} — deep missing 'c'
        [{path: ['deep', 'c'], expected: 'number'}],
      ],
    },

    interface_string_array_prop: {
      title: 'Interface with a string-array property',
      description: 'an array-typed property — exercises the dependency-call layer through an object',
      isType: () => createIsType<{tags: string[]}>(),
      deserializeIsType: () => deserializeIsType<{tags: string[]}>(),
      isTypeReflect: () => {
        const v: {tags: string[]} = {tags: []};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {tags: string[]} = {tags: []};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{tags: string[]}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{tags: string[]}>(),
      getTypeErrorsReflect: () => {
        const v: {tags: string[]} = {tags: []};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {tags: string[]} = {tags: []};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{tags: string[]}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{tags: string[]}>(),
      prepareForJsonReflect: () => {
        const v: {tags: string[]} = {tags: []};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {tags: string[]} = {tags: []};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{tags: string[]}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{tags: string[]}>(),
      restoreFromJsonReflect: () => {
        const v: {tags: string[]} = {tags: []};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {tags: string[]} = {tags: []};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{tags: []}, {tags: ['a', 'b']}],
        invalid: [{tags: ['a', 1]}, {tags: 'not array'}, null, undefined, {tags: [null]}, {tags: [undefined]}, {}],
      }),
      getExpectedErrors: () => [
        [{path: ['tags', 1], expected: 'string'}],
        [{path: ['tags'], expected: 'array'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['tags', 0], expected: 'string'}],
        [{path: ['tags', 0], expected: 'string'}],
        // {} — missing tags; the prop is required → object check
        // then property check; tags is undefined which is not array.
        [{path: ['tags'], expected: 'array'}],
      ],
    },

    circular_interface: {
      title: 'Self-referential interface (linked-list shape)',
      description:
        "mion interface.spec.ts 'validate circular object'. Exercises self-recursive dependency call (mion isSelf branch — `<innerFnName>(v.child)` without `.fn`).",
      isTypeNotes:
        'Self-referential shapes are validated recursively — depth is bounded only by the input value, not the type.',
      isType: () => {
        type ICircular = {name: string; child?: ICircular};
        return createIsType<ICircular>();
      },
      deserializeIsType: () => {
        type ICircular = {name: string; child?: ICircular};
        return deserializeIsType<ICircular>();
      },
      isTypeReflect: () => {
        type ICircular = {name: string; child?: ICircular};
        const v: ICircular = {name: 'root'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type ICircular = {name: string; child?: ICircular};
        const v: ICircular = {name: 'root'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type ICircular = {name: string; child?: ICircular};
        return createGetTypeErrors<ICircular>();
      },
      deserializeGetTypeErrors: () => {
        type ICircular = {name: string; child?: ICircular};
        return deserializeGetTypeErrors<ICircular>();
      },
      getTypeErrorsReflect: () => {
        type ICircular = {name: string; child?: ICircular};
        const v: ICircular = {name: 'root'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type ICircular = {name: string; child?: ICircular};
        const v: ICircular = {name: 'root'};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        type ICircular = {name: string; child?: ICircular};
        return createPrepareForJson<ICircular>();
      },
      deserializePrepareForJson: () => {
        type ICircular = {name: string; child?: ICircular};
        return deserializePrepareForJson<ICircular>();
      },
      prepareForJsonReflect: () => {
        type ICircular = {name: string; child?: ICircular};
        const v: ICircular = {name: 'root'};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        type ICircular = {name: string; child?: ICircular};
        const v: ICircular = {name: 'root'};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        type ICircular = {name: string; child?: ICircular};
        return createRestoreFromJson<ICircular>();
      },
      deserializeRestoreFromJson: () => {
        type ICircular = {name: string; child?: ICircular};
        return deserializeRestoreFromJson<ICircular>();
      },
      restoreFromJsonReflect: () => {
        type ICircular = {name: string; child?: ICircular};
        const v: ICircular = {name: 'root'};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        type ICircular = {name: string; child?: ICircular};
        const v: ICircular = {name: 'root'};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{name: 'root'}, {name: 'root', child: {name: 'a'}}, {name: 'root', child: {name: 'a', child: {name: 'b'}}}],
        invalid: [
          {name: 1},
          {name: 'x', child: {name: 1}},
          {name: 'x', child: 'not object'},
          null,
          undefined,
          {}, // missing required name
          {name: 'x', child: {}}, // child missing required name
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['name'], expected: 'string'}],
        [{path: ['child', 'name'], expected: 'string'}],
        [{path: ['child'], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['name'], expected: 'string'}],
        [{path: ['child', 'name'], expected: 'string'}],
      ],
    },

    circular_interface_on_array: {
      title: 'Self-referential interface via an array-of-self property',
      description:
        "mion interface.spec.ts 'validate circular interface on array' — circular type traversed via an array property.",
      isType: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        return createIsType<ICircularArray>();
      },
      deserializeIsType: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        return deserializeIsType<ICircularArray>();
      },
      isTypeReflect: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        const v: ICircularArray = {name: 'r'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        const v: ICircularArray = {name: 'r'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        return createGetTypeErrors<ICircularArray>();
      },
      deserializeGetTypeErrors: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        return deserializeGetTypeErrors<ICircularArray>();
      },
      getTypeErrorsReflect: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        const v: ICircularArray = {name: 'r'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        const v: ICircularArray = {name: 'r'};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        return createPrepareForJson<ICircularArray>();
      },
      deserializePrepareForJson: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        return deserializePrepareForJson<ICircularArray>();
      },
      prepareForJsonReflect: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        const v: ICircularArray = {name: 'r'};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        const v: ICircularArray = {name: 'r'};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        return createRestoreFromJson<ICircularArray>();
      },
      deserializeRestoreFromJson: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        return deserializeRestoreFromJson<ICircularArray>();
      },
      restoreFromJsonReflect: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        const v: ICircularArray = {name: 'r'};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        type ICircularArray = {name: string; children?: ICircularArray[]};
        const v: ICircularArray = {name: 'r'};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {name: 'r'},
          {name: 'r', children: []},
          {name: 'r', children: [{name: 'a'}, {name: 'b', children: [{name: 'c'}]}]},
        ],
        invalid: [{name: 'r', children: [{name: 1}]}, {name: 'r', children: 'not array'}, {name: 1}],
      }),
      getExpectedErrors: () => [
        [{path: ['children', 0, 'name'], expected: 'string'}],
        [{path: ['children'], expected: 'array'}],
        [{path: ['name'], expected: 'string'}],
      ],
    },

    circular_interface_on_nested_object: {
      title: 'Self-referential interface buried in a nested object',
      description:
        "mion interface.spec.ts 'validate circular interface on nested object' — circular reference deep inside a property.",
      isType: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        return createIsType<ICircularDeep>();
      },
      deserializeIsType: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        return deserializeIsType<ICircularDeep>();
      },
      isTypeReflect: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        return createGetTypeErrors<ICircularDeep>();
      },
      deserializeGetTypeErrors: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        return deserializeGetTypeErrors<ICircularDeep>();
      },
      getTypeErrorsReflect: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        return createPrepareForJson<ICircularDeep>();
      },
      deserializePrepareForJson: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        return deserializePrepareForJson<ICircularDeep>();
      },
      prepareForJsonReflect: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        return createRestoreFromJson<ICircularDeep>();
      },
      deserializeRestoreFromJson: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        return deserializeRestoreFromJson<ICircularDeep>();
      },
      restoreFromJsonReflect: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        type ICircularDeep = {name: string; embedded: {hello: string; child?: ICircularDeep}};
        const v: ICircularDeep = {name: 'r', embedded: {hello: 'h'}};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {name: 'r', embedded: {hello: 'h'}},
          {name: 'r', embedded: {hello: 'h', child: {name: 'c', embedded: {hello: 'h2'}}}},
        ],
        invalid: [{name: 'r'}, {name: 'r', embedded: {hello: 1}}, {name: 'r', embedded: null}],
      }),
      getExpectedErrors: () => [
        [{path: ['embedded'], expected: 'objectLiteral'}],
        [{path: ['embedded', 'hello'], expected: 'string'}],
        [{path: ['embedded'], expected: 'objectLiteral'}],
      ],
    },

    index_signature_string: {
      title: 'Index signature with string values',
      description:
        "mion indexProperty.spec.ts 'validate index run type' — for-in loop over own keys, value must satisfy the value type.",
      isTypeNotes: [
        'Validates own enumerable keys via `for...in` (not inherited). The empty object `{}` is valid.',
        'Every key\'s value must satisfy the value type — `{ a: 1 }` fails on `{[key: string]: string}`.',
      ],
      isType: () => createIsType<{[key: string]: string}>(),
      deserializeIsType: () => deserializeIsType<{[key: string]: string}>(),
      isTypeReflect: () => {
        const v: {[key: string]: string} = {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {[key: string]: string} = {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{[key: string]: string}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[key: string]: string}>(),
      getTypeErrorsReflect: () => {
        const v: {[key: string]: string} = {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {[key: string]: string} = {};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{[key: string]: string}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{[key: string]: string}>(),
      prepareForJsonReflect: () => {
        const v: {[key: string]: string} = {};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {[key: string]: string} = {};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{[key: string]: string}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{[key: string]: string}>(),
      restoreFromJsonReflect: () => {
        const v: {[key: string]: string} = {};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {[key: string]: string} = {};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{}, {a: 'x'}, {a: 'x', b: 'y'}],
        invalid: [{a: 1}, {a: 'x', b: 2}, null, 'not object', undefined, {a: null}, {a: undefined}],
      }),
      getExpectedErrors: () => [
        [{path: ['a'], expected: 'string'}],
        [{path: ['b'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['a'], expected: 'string'}],
        [{path: ['a'], expected: 'string'}],
      ],
    },

    index_signature_named_props: {
      title: 'Index signature combined with named properties',
      description:
        "mion indexProperty.spec.ts 'validate index run type + extra properties' — named props (a, b) AND the index signature both validate; extras (any key not a/b) must satisfy the union value type.",
      isType: () => createIsType<{a: string; b: number; [key: string]: string | number}>(),
      deserializeIsType: () => deserializeIsType<{a: string; b: number; [key: string]: string | number}>(),
      isTypeReflect: () => {
        const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{a: string; b: number; [key: string]: string | number}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string; b: number; [key: string]: string | number}>(),
      getTypeErrorsReflect: () => {
        const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{a: string; b: number; [key: string]: string | number}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{a: string; b: number; [key: string]: string | number}>(),
      prepareForJsonReflect: () => {
        const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{a: string; b: number; [key: string]: string | number}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{a: string; b: number; [key: string]: string | number}>(),
      restoreFromJsonReflect: () => {
        const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {a: string; b: number; [key: string]: string | number} = {a: 'x', b: 1};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {a: 'x', b: 1},
          {a: 'x', b: 1, extra: 'y'},
          {a: 'x', b: 1, extra: 7},
        ],
        invalid: [{a: 1, b: 1}, {a: 'x'}, null, {a: 'x', b: 1, extra: true}],
      }),
      getExpectedErrors: () => [
        // {a: 1, b: 1} — index-sig checks every own key. Both 'a' (=1)
        // and 'b' (=1) are valid by index-sig (string|number). But
        // named prop 'a: string' fails because v.a is 1 (number, not
        // string). Mion runs BOTH the named-prop checks and the
        // index-sig loop, so 'a' fails the string check from the
        // named prop side. Note: 'a' is allowed in the for-in loop's
        // index check (number is in union) so no extra error there.
        [{path: ['a'], expected: 'string'}],
        // {a: 'x'} — named prop 'b' missing → undefined fails number.
        // For-in loop only sees key 'a' which IS in the union (string).
        [{path: ['b'], expected: 'number'}],
        [{path: [], expected: 'objectLiteral'}],
        // {a: 'x', b: 1, extra: true} — named props OK; for-in loop
        // sees key 'extra' (true) which fails the union check.
        [{path: ['extra'], expected: 'union'}],
      ],
    },

    index_signature_nested: {
      title: 'Nested index signatures (number leaf values)',
      description: 'mion indexProperty.spec.ts nested rtNested — index sig pointing at another index sig.',
      isType: () => createIsType<{[key: string]: {[key: string]: number}}>(),
      deserializeIsType: () => deserializeIsType<{[key: string]: {[key: string]: number}}>(),
      isTypeReflect: () => {
        const v: {[key: string]: {[key: string]: number}} = {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {[key: string]: {[key: string]: number}} = {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{[key: string]: {[key: string]: number}}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[key: string]: {[key: string]: number}}>(),
      getTypeErrorsReflect: () => {
        const v: {[key: string]: {[key: string]: number}} = {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {[key: string]: {[key: string]: number}} = {};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{[key: string]: {[key: string]: number}}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{[key: string]: {[key: string]: number}}>(),
      prepareForJsonReflect: () => {
        const v: {[key: string]: {[key: string]: number}} = {};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {[key: string]: {[key: string]: number}} = {};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{[key: string]: {[key: string]: number}}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{[key: string]: {[key: string]: number}}>(),
      restoreFromJsonReflect: () => {
        const v: {[key: string]: {[key: string]: number}} = {};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {[key: string]: {[key: string]: number}} = {};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{}, {a: {x: 1, y: 2}}, {a: {}, b: {n: 0}}],
        invalid: [{a: 1}, {a: {x: 'not number'}}, null, undefined, {a: {x: NaN}}, {a: {x: null}}],
      }),
      getExpectedErrors: () => [
        [{path: ['a'], expected: 'objectLiteral'}],
        [{path: ['a', 'x'], expected: 'number'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['a', 'x'], expected: 'number'}],
        [{path: ['a', 'x'], expected: 'number'}],
      ],
    },

    index_signature_date_value: {
      title: 'Nested index signatures with Date leaf values',
      description: 'mion indexProperty.spec.ts rtNested2 — Date as the leaf value type.',
      isType: () => createIsType<{[key: string]: {[key: string]: Date}}>(),
      deserializeIsType: () => deserializeIsType<{[key: string]: {[key: string]: Date}}>(),
      isTypeReflect: () => {
        const v: {[key: string]: {[key: string]: Date}} = {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {[key: string]: {[key: string]: Date}} = {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{[key: string]: {[key: string]: Date}}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[key: string]: {[key: string]: Date}}>(),
      getTypeErrorsReflect: () => {
        const v: {[key: string]: {[key: string]: Date}} = {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {[key: string]: {[key: string]: Date}} = {};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{[key: string]: {[key: string]: Date}}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{[key: string]: {[key: string]: Date}}>(),
      prepareForJsonReflect: () => {
        const v: {[key: string]: {[key: string]: Date}} = {};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {[key: string]: {[key: string]: Date}} = {};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{[key: string]: {[key: string]: Date}}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{[key: string]: {[key: string]: Date}}>(),
      restoreFromJsonReflect: () => {
        const v: {[key: string]: {[key: string]: Date}} = {};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {[key: string]: {[key: string]: Date}} = {};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{}, {a: {x: new Date()}}],
        invalid: [{a: {x: 'not date'}}, {a: 'not object'}, null, undefined, {a: {x: new Date('invalid')}}],
      }),
      getExpectedErrors: () => [
        [{path: ['a', 'x'], expected: 'date'}],
        [{path: ['a'], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['a', 'x'], expected: 'date'}],
      ],
    },

    index_signature_non_root: {
      title: 'Index signature on a nested (non-root) object property',
      description:
        "mion indexProperty.spec.ts 'IndexType non root' — index signature attached to a nested (non-root) object property.",
      isType: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        return createIsType<Obj2>();
      },
      deserializeIsType: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        return deserializeIsType<Obj2>();
      },
      isTypeReflect: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        const v: Obj2 = {b: 'hello', c: {a: 'world'}};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        const v: Obj2 = {b: 'hello', c: {a: 'world'}};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        return createGetTypeErrors<Obj2>();
      },
      deserializeGetTypeErrors: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        return deserializeGetTypeErrors<Obj2>();
      },
      getTypeErrorsReflect: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        const v: Obj2 = {b: 'hello', c: {a: 'world'}};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        const v: Obj2 = {b: 'hello', c: {a: 'world'}};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        return createPrepareForJson<Obj2>();
      },
      deserializePrepareForJson: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        return deserializePrepareForJson<Obj2>();
      },
      prepareForJsonReflect: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        const v: Obj2 = {b: 'hello', c: {a: 'world'}};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        const v: Obj2 = {b: 'hello', c: {a: 'world'}};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        return createRestoreFromJson<Obj2>();
      },
      deserializeRestoreFromJson: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        return deserializeRestoreFromJson<Obj2>();
      },
      restoreFromJsonReflect: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        const v: Obj2 = {b: 'hello', c: {a: 'world'}};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        interface Obj1 {
          a: string;
          [key: string]: string;
        }
        interface Obj2 {
          b: string;
          c: Obj1;
        }
        const v: Obj2 = {b: 'hello', c: {a: 'world'}};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {b: 'hello', c: {a: 'world', c: 'world'}},
          {b: 'x', c: {a: 'y'}},
        ],
        invalid: [{b: 'hello', c: {a: 'world', c: 123}}, {b: 'hello'}, {b: 'hello', c: 'not object'}, null],
      }),
      getExpectedErrors: () => [
        // c is index-sig {[key]: string} + named prop 'a: string'. Key 'c' has 123 — fails string check at [c, c].
        [{path: ['c', 'c'], expected: 'string'}],
        // {b:'hello'} — missing c which is required → fails objectLiteral at [c]
        [{path: ['c'], expected: 'objectLiteral'}],
        [{path: ['c'], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    function_top_level: {
      title: 'Function type at top level (any function passes)',
      description: "mion FunctionRunType.emitIsType — `typeof v === 'function'`. Param-arity check is deferred (mion-level).",
      isTypeNotes: [
        'TS DIVERGENCE: ANY function passes, regardless of signature — arrow functions, async functions, class declarations (typeof === "function") all satisfy `() => void`.',
        'Parameter types and return type are NOT verified at runtime. If you need a specific call shape, validate at the call boundary.',
      ],
      isType: () => createIsType<() => void>(),
      deserializeIsType: () => deserializeIsType<() => void>(),
      isTypeReflect: () => {
        const v: () => void = () => {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: () => void = () => {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<() => void>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<() => void>(),
      getTypeErrorsReflect: () => {
        const v: () => void = () => {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: () => void = () => {};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<() => void>(),
      deserializePrepareForJson: () => deserializePrepareForJson<() => void>(),
      prepareForJsonReflect: () => {
        const v: () => void = () => {};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: () => void = () => {};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<() => void>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<() => void>(),
      restoreFromJsonReflect: () => {
        const v: () => void = () => {};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: () => void = () => {};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [() => {}, function () {}, async () => {}, class {}],
        invalid: [null, undefined, 42, 'function', {}, [], true],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'function'}],
        [{path: [], expected: 'function'}],
        [{path: [], expected: 'function'}],
        [{path: [], expected: 'function'}],
        [{path: [], expected: 'function'}],
        [{path: [], expected: 'function'}],
        [{path: [], expected: 'function'}],
      ],
    },

    // ---- DEFERRED — kept as data for future adapter activation ----

    interface_callable: {
      title: 'Callable interface (function plus data properties)',
      description:
        'mion interface.spec.ts "validate callable interface" — the emit detects a CallSignature child and switches the typeof guard from `object` to `function`, then AND-chains the remaining properties on top (JS functions can carry properties).',
      isTypeNotes:
        'Callable interfaces require a function value (`typeof === "function"`) PLUS the declared data properties. JS functions can carry properties; this case validates both halves.',
      isType: () => createIsType<{(a: number, b: boolean): string; extra: string}>(),
      deserializeIsType: () => deserializeIsType<{(a: number, b: boolean): string; extra: string}>(),
      isTypeReflect: () => {
        const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
          function (_a: number, _b: boolean) {
            return 'x';
          },
          {extra: 'x'}
        );
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
          function (_a: number, _b: boolean) {
            return 'x';
          },
          {extra: 'x'}
        );
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{(a: number, b: boolean): string; extra: string}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{(a: number, b: boolean): string; extra: string}>(),
      getTypeErrorsReflect: () => {
        const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
          function (_a: number, _b: boolean) {
            return 'x';
          },
          {extra: 'x'}
        );
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
          function (_a: number, _b: boolean) {
            return 'x';
          },
          {extra: 'x'}
        );
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{(a: number, b: boolean): string; extra: string}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{(a: number, b: boolean): string; extra: string}>(),
      prepareForJsonReflect: () => {
        const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
          function (_a: number, _b: boolean) {
            return 'x';
          },
          {extra: 'x'}
        );
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
          function (_a: number, _b: boolean) {
            return 'x';
          },
          {extra: 'x'}
        );
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{(a: number, b: boolean): string; extra: string}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{(a: number, b: boolean): string; extra: string}>(),
      restoreFromJsonReflect: () => {
        const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
          function (_a: number, _b: boolean) {
            return 'x';
          },
          {extra: 'x'}
        );
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {(a: number, b: boolean): string; extra: string} = Object.assign(
          function (_a: number, _b: boolean) {
            return 'x';
          },
          {extra: 'x'}
        );
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          Object.assign(
            function (_a: number, _b: boolean) {
              return 'x';
            },
            {extra: 'x'}
          ),
        ],
        invalid: [
          {extra: 'x'}, // not a function
          () => {}, // missing `extra` prop
          Object.assign(() => {}, {extra: 42}), // extra wrong type
          null,
          undefined,
          Object.assign(() => {}, {extra: null}), // extra wrong type (null)
        ],
      }),
      // Callable interface emits `typeof v === 'function'` as the
      // top-level guard (instead of object). Non-functions report
      // `expected: 'function'`; functions that pass the guard fall
      // through to per-property checks.
      getExpectedErrors: () => [
        [{path: [], expected: 'function'}],
        [{path: ['extra'], expected: 'string'}],
        [{path: ['extra'], expected: 'string'}],
        [{path: [], expected: 'function'}],
        [{path: [], expected: 'function'}],
        [{path: ['extra'], expected: 'string'}],
      ],
    },

    interface_all_optional: {
      title: 'Interface with every property optional (plain-object guard)',
      description:
        "mion interface.spec.ts \"validate empty object for ObjectAllOptional type\". The `allOptionalCode` guard `(!Array.isArray(v) && Object.prototype.toString.call(v) === '[object Object]')` is added when every contributing child is optional, so arrays / Date / Map / Set are explicitly rejected (without the guard they'd slip through the bare `typeof === 'object'` check).",
      isTypeNotes: [
        'When every property is optional, the empty object `{}` would otherwise pass any non-plain-object input that has `typeof === "object"`.',
        'An extra guard rejects arrays, Date, Map, Set, RegExp, and other non-plain objects via `Object.prototype.toString.call(v) === "[object Object]"`.',
        'This is the ONLY shape kind where the validator enforces "plain object" semantics — see the bare `object` case for the contrast.',
      ],
      isType: () => createIsType<{a?: string; b?: number}>(),
      deserializeIsType: () => deserializeIsType<{a?: string; b?: number}>(),
      isTypeReflect: () => {
        const v: {a?: string; b?: number} = {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {a?: string; b?: number} = {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{a?: string; b?: number}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a?: string; b?: number}>(),
      getTypeErrorsReflect: () => {
        const v: {a?: string; b?: number} = {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {a?: string; b?: number} = {};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{a?: string; b?: number}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{a?: string; b?: number}>(),
      prepareForJsonReflect: () => {
        const v: {a?: string; b?: number} = {};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {a?: string; b?: number} = {};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{a?: string; b?: number}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{a?: string; b?: number}>(),
      restoreFromJsonReflect: () => {
        const v: {a?: string; b?: number} = {};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {a?: string; b?: number} = {};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{}, {a: 'x'}, {a: 'x', b: 1}, {a: undefined, b: undefined}],
        invalid: [[], new Date(), new Map(), new Set(), null, 'hello', 42, undefined, /regex/, true],
      }),
      // The `allOptionalCode` guard rejects arrays / Date / Map / Set /
      // RegExp at the top level so every invalid sample fails the
      // objectLiteral check (the children body never runs).
      getExpectedErrors: () => [
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    class_simple: {
      title: 'Class with two atomic props (instance or plain match)',
      description:
        "mion class.spec.ts 'validate class'. ClassRunType inherits InterfaceRunType.emitIsType in mion, so the KindClass+SubKindNone arm in istype.go falls through to emitObjectIsType. The serializer filters synthetic `prototype` members from class projections so the AND chain only includes user-declared properties + methods (methods drop out via the function-skip rule).",
      isTypeNotes: [
        'Plain object literals matching the class shape PASS — `instanceof` is NOT checked.',
        'Methods are skipped per the function-property rule; only data properties are validated.',
      ],
      isType: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        return createIsType<MySerializableClass>();
      },
      deserializeIsType: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        return deserializeIsType<MySerializableClass>();
      },
      isTypeReflect: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        return createGetTypeErrors<MySerializableClass>();
      },
      deserializeGetTypeErrors: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        return deserializeGetTypeErrors<MySerializableClass>();
      },
      getTypeErrorsReflect: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        return createPrepareForJson<MySerializableClass>();
      },
      deserializePrepareForJson: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        return deserializePrepareForJson<MySerializableClass>();
      },
      prepareForJsonReflect: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        return createRestoreFromJson<MySerializableClass>();
      },
      deserializeRestoreFromJson: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        return deserializeRestoreFromJson<MySerializableClass>();
      },
      restoreFromJsonReflect: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        class MySerializableClass {
          date: Date;
          name: string;
          constructor(date: Date, name: string) {
            this.date = date;
            this.name = name;
          }
          someMethod() {
            return 'unused';
          }
        }
        const v: MySerializableClass = new MySerializableClass(new Date(), 'x');
        return deserializeRestoreFromJson(v);
      },
      // The third valid sample carries a `someMethod` function which
      // JSON.stringify drops. The first sample is a class instance with
      // its own (prototype) `someMethod` — also dropped. After the
      // round-trip both lose their function, so the reference side
      // would mismatch. Limit the round-trip samples to plain-data
      // objects (which the serializer correctly preserves).
      getRoundTripValid: () => [{date: new Date(), name: 'x'}],
      getSamples: () => {
        class Match {
          date = new Date();
          name = 'x';
          someMethod() {
            return 'unused';
          }
        }
        return {
          valid: [new Match(), {date: new Date(), name: 'x'}, {date: new Date(), name: 'x', someMethod: () => null}],
          invalid: [
            {date: 'not date', name: 'x'},
            {date: new Date()},
            {name: 'x'},
            null,
            'not object',
            undefined,
            {date: new Date('invalid'), name: 'x'},
            {date: new Date(NaN), name: 'x'},
          ],
        };
      },
      getExpectedErrors: () => [
        [{path: ['date'], expected: 'date'}],
        [{path: ['name'], expected: 'string'}],
        [{path: ['date'], expected: 'date'}],
        [{path: [], expected: 'class'}],
        [{path: [], expected: 'class'}],
        [{path: [], expected: 'class'}],
        [{path: ['date'], expected: 'date'}],
        [{path: ['date'], expected: 'date'}],
      ],
    },

    rpc_error_class: {
      title: 'RpcError-shaped class with branded discriminator',
      description:
        "mion classRpcError.spec.ts — verifies the standard class projection handles RpcError-shaped classes (the actual @mionjs/core RpcError isn't a built-in node kind; it's a regular class with a literal-true brand + generic type discriminator). We define a local equivalent here to exercise the same shape end-to-end without pulling in the @mionjs/core dependency for a single test.",
      isTypeNotes: [
        'Brand property + `type` discriminator + `publicMessage` are all required.',
        '`Error` base-class fields (`message`, `name`, `stack`) are NOT declared on the class shape and so are NOT validated.',
      ],
      isType: () => {
        // Mirrors @mionjs/core's RpcError public shape:
        //   - `mion@isΣrrθr: true` brand (literal true)
        //   - `type: ErrType` generic discriminator
        //   - `publicMessage: string`
        //   - `id?: string`
        // `message` / `name` / `stack` are intentionally NOT declared
        // as TS properties (they exist at runtime via Error) so isType
        // doesn't validate them.
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        return createIsType<RpcError<'test-error'>>();
      },
      deserializeIsType: () => {
        // Mirrors @mionjs/core's RpcError public shape:
        //   - `mion@isΣrrθr: true` brand (literal true)
        //   - `type: ErrType` generic discriminator
        //   - `publicMessage: string`
        //   - `id?: string`
        // `message` / `name` / `stack` are intentionally NOT declared
        // as TS properties (they exist at runtime via Error) so isType
        // doesn't validate them.
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        return deserializeIsType<RpcError<'test-error'>>();
      },
      isTypeReflect: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        return createGetTypeErrors<RpcError<'test-error'>>();
      },
      deserializeGetTypeErrors: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        return deserializeGetTypeErrors<RpcError<'test-error'>>();
      },
      getTypeErrorsReflect: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        return createPrepareForJson<RpcError<'test-error'>>();
      },
      deserializePrepareForJson: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        return deserializePrepareForJson<RpcError<'test-error'>>();
      },
      prepareForJsonReflect: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        return createRestoreFromJson<RpcError<'test-error'>>();
      },
      deserializeRestoreFromJson: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        return deserializeRestoreFromJson<RpcError<'test-error'>>();
      },
      restoreFromJsonReflect: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        class RpcError<ErrType extends string> {
          public readonly 'mion@isΣrrθr': true = true;
          public readonly type: ErrType;
          public readonly publicMessage: string;
          public readonly id?: string;
          constructor(args: {type: ErrType; publicMessage: string; id?: string}) {
            this.type = args.type;
            this.publicMessage = args.publicMessage;
            this.id = args.id;
          }
        }
        const v: RpcError<'test-error'> = new RpcError({type: 'test-error', publicMessage: 'error'});
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => {
        const validInstance = {
          'mion@isΣrrθr': true,
          type: 'test-error',
          publicMessage: 'error',
        };
        const validWithId = {...validInstance, id: 'error-123'};
        return {
          valid: [validInstance, validWithId],
          invalid: [
            // brand wrong
            {'mion@isΣrrθr': false, type: 'test-error', publicMessage: 'x'},
            // type discriminator wrong
            {'mion@isΣrrθr': true, type: 'other-error', publicMessage: 'x'},
            // missing publicMessage
            {'mion@isΣrrθr': true, type: 'test-error'},
            null,
            'not object',
            undefined,
            {}, // missing everything
            {publicMessage: 'x'}, // missing brand + type
            // publicMessage wrong type
            {'mion@isΣrrθr': true, type: 'test-error', publicMessage: 42},
          ],
        };
      },
      getExpectedErrors: () => [
        // brand wrong (mion@isΣrrθr: false) → literal check fails
        [{path: ['mion@isΣrrθr'], expected: 'literal'}],
        // type discriminator wrong → literal check fails
        [{path: ['type'], expected: 'literal'}],
        // missing publicMessage (undefined fails string)
        [{path: ['publicMessage'], expected: 'string'}],
        [{path: [], expected: 'class'}],
        [{path: [], expected: 'class'}],
        [{path: [], expected: 'class'}],
        // {} — all three required props missing → 3 errors
        [
          {path: ['mion@isΣrrθr'], expected: 'literal'},
          {path: ['type'], expected: 'literal'},
          {path: ['publicMessage'], expected: 'string'},
        ],
        // {publicMessage: 'x'} — brand + type missing
        [
          {path: ['mion@isΣrrθr'], expected: 'literal'},
          {path: ['type'], expected: 'literal'},
        ],
        // publicMessage wrong type
        [{path: ['publicMessage'], expected: 'string'}],
      ],
    },

    call_signature_params: {
      title: 'Function parameters extracted via Parameters<F>',
      description:
        "mion callSignature.spec.ts 'should validate correct parameters' — mion exposes this via `rt.getCallSignature().createJitParamsFunction(JitFunctions.isType)`; our pipeline uses TypeScript's built-in `Parameters<F>` to extract the param tuple as a first-class type and reuses the standard tuple emit. Same observable behavior: the validator accepts `[number, boolean]`, rejects wrong-type args, accepts missing trailing args (treats them as undefined per mion's `v.length <= N` policy), rejects excess args.",
      isType: () => {
        type CallSig = (a: number, b: boolean) => string;
        return createIsType<Parameters<CallSig>>();
      },
      deserializeIsType: () => {
        type CallSig = (a: number, b: boolean) => string;
        return deserializeIsType<Parameters<CallSig>>();
      },
      isTypeReflect: () => {
        type CallSig = (a: number, b: boolean) => string;
        const v: Parameters<CallSig> = [1, true];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type CallSig = (a: number, b: boolean) => string;
        const v: Parameters<CallSig> = [1, true];
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type CallSig = (a: number, b: boolean) => string;
        return createGetTypeErrors<Parameters<CallSig>>();
      },
      deserializeGetTypeErrors: () => {
        type CallSig = (a: number, b: boolean) => string;
        return deserializeGetTypeErrors<Parameters<CallSig>>();
      },
      getTypeErrorsReflect: () => {
        type CallSig = (a: number, b: boolean) => string;
        const v: Parameters<CallSig> = [1, true];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type CallSig = (a: number, b: boolean) => string;
        const v: Parameters<CallSig> = [1, true];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        type CallSig = (a: number, b: boolean) => string;
        return createPrepareForJson<Parameters<CallSig>>();
      },
      deserializePrepareForJson: () => {
        type CallSig = (a: number, b: boolean) => string;
        return deserializePrepareForJson<Parameters<CallSig>>();
      },
      prepareForJsonReflect: () => {
        type CallSig = (a: number, b: boolean) => string;
        const v: Parameters<CallSig> = [1, true];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        type CallSig = (a: number, b: boolean) => string;
        const v: Parameters<CallSig> = [1, true];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        type CallSig = (a: number, b: boolean) => string;
        return createRestoreFromJson<Parameters<CallSig>>();
      },
      deserializeRestoreFromJson: () => {
        type CallSig = (a: number, b: boolean) => string;
        return deserializeRestoreFromJson<Parameters<CallSig>>();
      },
      restoreFromJsonReflect: () => {
        type CallSig = (a: number, b: boolean) => string;
        const v: Parameters<CallSig> = [1, true];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        type CallSig = (a: number, b: boolean) => string;
        const v: Parameters<CallSig> = [1, true];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          [1, true],
          [0, false],
          // mion: missing trailing args treated as undefined; if the
          // param type is `boolean` (not `boolean | undefined`) then
          // `[1]` fails because v[1] === undefined doesn't satisfy
          // typeof === 'boolean'. Same shape here.
        ],
        invalid: [
          [1, 'not boolean'],
          [1], // missing required boolean
          [1, true, 'extra'], // excess args
          ['not number', true],
          'not array',
          null,
          undefined,
          [NaN, true], // NaN fails Number.isFinite
          [],
        ],
      }),
      getExpectedErrors: () => [
        [{path: [1], expected: 'boolean'}],
        [{path: [1], expected: 'boolean'}],
        [{path: [], expected: 'tuple'}],
        [{path: [0], expected: 'number'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [0], expected: 'number'}],
        [
          {path: [0], expected: 'number'},
          {path: [1], expected: 'boolean'},
        ],
      ],
    },

    call_signature_params_with_optional: {
      title: 'Parameters<F> tuple with a trailing optional argument',
      description:
        "mion function.spec.ts 'validate function parameters' — params tuple with a trailing optional. `Parameters<F>` resolves to `[number, boolean, string?]`; the optional slot accepts undefined OR a string.",
      isType: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        return createIsType<Parameters<CallSig>>();
      },
      deserializeIsType: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        return deserializeIsType<Parameters<CallSig>>();
      },
      isTypeReflect: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        const v: Parameters<CallSig> = [3, true, 'hello'];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        const v: Parameters<CallSig> = [3, true, 'hello'];
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        return createGetTypeErrors<Parameters<CallSig>>();
      },
      deserializeGetTypeErrors: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        return deserializeGetTypeErrors<Parameters<CallSig>>();
      },
      getTypeErrorsReflect: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        const v: Parameters<CallSig> = [3, true, 'hello'];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        const v: Parameters<CallSig> = [3, true, 'hello'];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        return createPrepareForJson<Parameters<CallSig>>();
      },
      deserializePrepareForJson: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        return deserializePrepareForJson<Parameters<CallSig>>();
      },
      prepareForJsonReflect: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        const v: Parameters<CallSig> = [3, true, 'hello'];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        const v: Parameters<CallSig> = [3, true, 'hello'];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        return createRestoreFromJson<Parameters<CallSig>>();
      },
      deserializeRestoreFromJson: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        return deserializeRestoreFromJson<Parameters<CallSig>>();
      },
      restoreFromJsonReflect: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        const v: Parameters<CallSig> = [3, true, 'hello'];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        type CallSig = (a: number, b: boolean, c?: string) => Date;
        const v: Parameters<CallSig> = [3, true, 'hello'];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          [3, true, 'hello'],
          [3, false],
        ],
        invalid: [
          [3, 3, 3], // wrong type for b and c
          [3, true, 'hello', 7], // excess args
          [3], // missing required boolean
          'not array',
          null,
          undefined,
          [NaN, true], // NaN fails Number.isFinite
        ],
      }),
      getExpectedErrors: () => [
        // [3, 3, 3] — slot 1 (3 not boolean) AND slot 2 (3 not string, optional but defined).
        [
          {path: [1], expected: 'boolean'},
          {path: [2], expected: 'string'},
        ],
        [{path: [], expected: 'tuple'}],
        [{path: [1], expected: 'boolean'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [0], expected: 'number'}],
      ],
    },

    call_signature_params_with_rest: {
      title: 'Parameters<F> tuple with a trailing rest segment',
      description:
        "mion function.spec.ts 'validate function with rest parameters' — params tuple ending in a rest segment. `Parameters<F>` resolves to `[number, boolean, ...Date[]]`; all trailing slots must satisfy Date.",
      isType: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        return createIsType<Parameters<CallSig>>();
      },
      deserializeIsType: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        return deserializeIsType<Parameters<CallSig>>();
      },
      isTypeReflect: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        const v: Parameters<CallSig> = [3, true];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        const v: Parameters<CallSig> = [3, true];
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        return createGetTypeErrors<Parameters<CallSig>>();
      },
      deserializeGetTypeErrors: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        return deserializeGetTypeErrors<Parameters<CallSig>>();
      },
      getTypeErrorsReflect: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        const v: Parameters<CallSig> = [3, true];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        const v: Parameters<CallSig> = [3, true];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        return createPrepareForJson<Parameters<CallSig>>();
      },
      deserializePrepareForJson: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        return deserializePrepareForJson<Parameters<CallSig>>();
      },
      prepareForJsonReflect: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        const v: Parameters<CallSig> = [3, true];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        const v: Parameters<CallSig> = [3, true];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        return createRestoreFromJson<Parameters<CallSig>>();
      },
      deserializeRestoreFromJson: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        return deserializeRestoreFromJson<Parameters<CallSig>>();
      },
      restoreFromJsonReflect: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        const v: Parameters<CallSig> = [3, true];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        type CallSig = (a: number, b: boolean, ...c: Date[]) => Date;
        const v: Parameters<CallSig> = [3, true];
        return deserializeRestoreFromJson(v);
      },
      // Tuple support isn't wired into the serializer pair yet
      // (lands in phase 4). With no factory for `[number, boolean,
      // ...Date[]]`, the identity fallback runs — but the Date rest
      // elements don't survive identity JSON round-trip. Restrict the
      // round-trip samples to the Date-free entries; phase 4 will
      // drop this override.
      getRoundTripValid: () => [
        [3, false],
        [3, true],
      ],
      getSamples: () => {
        const date1 = new Date();
        const date2 = new Date();
        return {
          valid: [
            [3, true, date1, date2],
            [3, false],
            [3, true],
          ],
          invalid: [
            [3, 3, 3], // wrong type for b
            [3, true, new Date(), 7], // 7 is not a Date in rest slot
            [3, true, new Date(), 7, true], // multiple wrong rest entries
            'not array',
            null,
            undefined,
            [3, true, new Date('invalid')], // Invalid Date in rest slot
          ],
        };
      },
      getExpectedErrors: () => [
        // [3, 3, 3] — slot 1 (3 not boolean), rest from slot 2: iVar=2 3 not Date.
        [
          {path: [1], expected: 'boolean'},
          {path: [2], expected: 'date'},
        ],
        // [3, true, new Date(), 7] — rest iVar=2 Date OK, iVar=3 7 not Date.
        [{path: [3], expected: 'date'}],
        // [3, true, new Date(), 7, true] — rest 2 OK, 3 fails, 4 fails.
        [
          {path: [3], expected: 'date'},
          {path: [4], expected: 'date'},
        ],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        // [3, true, new Date('invalid')] — rest iVar=2 Invalid Date.
        [{path: [2], expected: 'date'}],
      ],
    },

    record_union_keys: {
      title: 'Record<UnionKey, V> — resolves to a fixed-property shape',
      description:
        '`Record<K, V>` with a literal-union key resolves to a fixed-property object literal (`{a: V; b: V}`) at the type-checker level — tsgo distributes the union over the property names. Same emit path as a hand-written object literal; each key is a required property of type V.',
      isType: () => createIsType<Record<'a' | 'b', number>>(),
      deserializeIsType: () => deserializeIsType<Record<'a' | 'b', number>>(),
      isTypeReflect: () => {
        const v: Record<'a' | 'b', number> = {a: 1, b: 2};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Record<'a' | 'b', number> = {a: 1, b: 2};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Record<'a' | 'b', number>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Record<'a' | 'b', number>>(),
      getTypeErrorsReflect: () => {
        const v: Record<'a' | 'b', number> = {a: 1, b: 2};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Record<'a' | 'b', number> = {a: 1, b: 2};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<Record<'a' | 'b', number>>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Record<'a' | 'b', number>>(),
      prepareForJsonReflect: () => {
        const v: Record<'a' | 'b', number> = {a: 1, b: 2};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: Record<'a' | 'b', number> = {a: 1, b: 2};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<Record<'a' | 'b', number>>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Record<'a' | 'b', number>>(),
      restoreFromJsonReflect: () => {
        const v: Record<'a' | 'b', number> = {a: 1, b: 2};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: Record<'a' | 'b', number> = {a: 1, b: 2};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {a: 1, b: 2},
          {a: 0, b: 0},
          // Extra props pass — Record<UnionKey, V> doesn't imply strict.
          {a: 1, b: 2, c: 3},
        ],
        invalid: [
          {a: 1}, // missing 'b'
          {b: 1}, // missing 'a'
          {}, // empty
          {a: 'x', b: 1}, // wrong type
          null,
          'not object',
          undefined,
          {a: 1, b: NaN}, // NaN fails Number.isFinite
          {a: Infinity, b: 1},
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['b'], expected: 'number'}],
        [{path: ['a'], expected: 'number'}],
        [
          {path: ['a'], expected: 'number'},
          {path: ['b'], expected: 'number'},
        ],
        [{path: ['a'], expected: 'number'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['b'], expected: 'number'}],
        [{path: ['a'], expected: 'number'}],
      ],
    },

    union_value_index: {
      title: 'Index signature with a union value type',
      description:
        'index signature with union value type — union emit landed; for-in loop applies the union check to every own key.',
      isType: () => createIsType<{[key: string]: string | number}>(),
      deserializeIsType: () => deserializeIsType<{[key: string]: string | number}>(),
      isTypeReflect: () => {
        const v: {[key: string]: string | number} = {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {[key: string]: string | number} = {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{[key: string]: string | number}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[key: string]: string | number}>(),
      getTypeErrorsReflect: () => {
        const v: {[key: string]: string | number} = {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {[key: string]: string | number} = {};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{[key: string]: string | number}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{[key: string]: string | number}>(),
      prepareForJsonReflect: () => {
        const v: {[key: string]: string | number} = {};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {[key: string]: string | number} = {};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{[key: string]: string | number}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{[key: string]: string | number}>(),
      restoreFromJsonReflect: () => {
        const v: {[key: string]: string | number} = {};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {[key: string]: string | number} = {};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{}, {a: 'x'}, {a: 'x', b: 1}, {a: 1, b: 'x'}],
        invalid: [{a: true}, {a: 'x', b: null}, 'not object', null, undefined, {a: BigInt(1)}, {a: NaN}],
      }),
      getExpectedErrors: () => [
        [{path: ['a'], expected: 'union'}],
        [{path: ['b'], expected: 'union'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['a'], expected: 'union'}],
        [{path: ['a'], expected: 'union'}],
      ],
    },

    object_with_union_prop: {
      title: 'Object with a discriminated-union string property',
      description:
        'discriminated union as a property type — union emit handles the literal-string union as an OR-chain of `===` checks.',
      isType: () => createIsType<{kind: 'a' | 'b'; n: number}>(),
      deserializeIsType: () => deserializeIsType<{kind: 'a' | 'b'; n: number}>(),
      isTypeReflect: () => {
        const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{kind: 'a' | 'b'; n: number}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{kind: 'a' | 'b'; n: number}>(),
      getTypeErrorsReflect: () => {
        const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{kind: 'a' | 'b'; n: number}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{kind: 'a' | 'b'; n: number}>(),
      prepareForJsonReflect: () => {
        const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{kind: 'a' | 'b'; n: number}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{kind: 'a' | 'b'; n: number}>(),
      restoreFromJsonReflect: () => {
        const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {kind: 'a' | 'b'; n: number} = {kind: 'a', n: 1};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {kind: 'a', n: 1},
          {kind: 'b', n: 0},
        ],
        invalid: [{kind: 'c', n: 1}, {n: 1}, {kind: 'a', n: 'not number'}, null, undefined, {kind: 'a', n: NaN}, {kind: 'a'}],
      }),
      getExpectedErrors: () => [
        [{path: ['kind'], expected: 'union'}],
        [{path: ['kind'], expected: 'union'}],
        [{path: ['n'], expected: 'number'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['n'], expected: 'number'}],
        [{path: ['n'], expected: 'number'}],
      ],
    },

    interface_inheritance: {
      title: 'Interface that extends a parent interface',
      description:
        "TS `interface Child extends Base {…}` — inherited props are merged into the child's RunType.Children by tsgo's GetPropertiesOfType. The validator's emit walks the merged set; runtime behaviour matches a hand-flattened object literal.",
      isTypeNotes:
        '`extends` is resolved at the type-checker layer — the runtype carries every inherited prop directly in its children list, so the validator does NOT separately walk the parent type.',
      isType: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        return createIsType<Child>();
      },
      deserializeIsType: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        return deserializeIsType<Child>();
      },
      isTypeReflect: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        const v: Child = {a: 'x', b: 1};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        const v: Child = {a: 'x', b: 1};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        return createGetTypeErrors<Child>();
      },
      deserializeGetTypeErrors: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        return deserializeGetTypeErrors<Child>();
      },
      getTypeErrorsReflect: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        const v: Child = {a: 'x', b: 1};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        const v: Child = {a: 'x', b: 1};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        return createPrepareForJson<Child>();
      },
      deserializePrepareForJson: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        return deserializePrepareForJson<Child>();
      },
      prepareForJsonReflect: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        const v: Child = {a: 'x', b: 1};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        const v: Child = {a: 'x', b: 1};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        return createRestoreFromJson<Child>();
      },
      deserializeRestoreFromJson: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        return deserializeRestoreFromJson<Child>();
      },
      restoreFromJsonReflect: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        const v: Child = {a: 'x', b: 1};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        interface Base {
          a: string;
        }
        interface Child extends Base {
          b: number;
        }
        const v: Child = {a: 'x', b: 1};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {a: 'x', b: 1},
          {a: '', b: 0},
        ],
        invalid: [
          {a: 'x'}, // missing b (inherited check still applies)
          {b: 1}, // missing a (parent prop)
          {a: 1, b: 1}, // a wrong type
          null,
          undefined,
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['b'], expected: 'number'}],
        [{path: ['a'], expected: 'string'}],
        [{path: ['a'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    class_inheritance: {
      title: 'Class that extends a parent class',
      description:
        'TS `class Sub extends Base {…}` — same merging as interface inheritance, but on the KindClass branch. Inherited data members appear in the child class\'s Children alongside its own.',
      isType: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        return createIsType<Sub>();
      },
      deserializeIsType: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        return deserializeIsType<Sub>();
      },
      isTypeReflect: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        const v: Sub = new Sub();
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        const v: Sub = new Sub();
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        return createGetTypeErrors<Sub>();
      },
      deserializeGetTypeErrors: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        return deserializeGetTypeErrors<Sub>();
      },
      getTypeErrorsReflect: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        const v: Sub = new Sub();
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        const v: Sub = new Sub();
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        return createPrepareForJson<Sub>();
      },
      deserializePrepareForJson: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        return deserializePrepareForJson<Sub>();
      },
      prepareForJsonReflect: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        const v: Sub = new Sub();
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        const v: Sub = new Sub();
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        return createRestoreFromJson<Sub>();
      },
      deserializeRestoreFromJson: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        return deserializeRestoreFromJson<Sub>();
      },
      restoreFromJsonReflect: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        const v: Sub = new Sub();
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        class Base {
          a: string = '';
        }
        class Sub extends Base {
          b: number = 0;
        }
        const v: Sub = new Sub();
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {a: 'x', b: 1},
          {a: '', b: 0},
        ],
        invalid: [
          {a: 'x'}, // missing inherited b
          {b: 1}, // missing inherited a
          {a: 'x', b: 'not number'},
          null,
          undefined,
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['b'], expected: 'number'}],
        [{path: ['a'], expected: 'string'}],
        [{path: ['b'], expected: 'number'}],
        [{path: [], expected: 'class'}],
        [{path: [], expected: 'class'}],
      ],
    },

    index_signature_number_key: {
      title: 'Index signature with a number key',
      description:
        '`{[k: number]: T}` — TS lets you declare number-keyed index signatures. JS object keys are always strings at runtime, so the resolver normalises this to the same shape as `{[k: string]: T}` and the validator behaves identically.',
      isTypeNotes:
        'TS DIVERGENCE: At runtime, all object keys are strings; the number key type constraint is enforced only by the TS compiler. The validator accepts any own enumerable key whose value satisfies T.',
      isType: () => createIsType<{[k: number]: string}>(),
      deserializeIsType: () => deserializeIsType<{[k: number]: string}>(),
      isTypeReflect: () => {
        const v: {[k: number]: string} = {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {[k: number]: string} = {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{[k: number]: string}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[k: number]: string}>(),
      getTypeErrorsReflect: () => {
        const v: {[k: number]: string} = {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {[k: number]: string} = {};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{[k: number]: string}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{[k: number]: string}>(),
      prepareForJsonReflect: () => {
        const v: {[k: number]: string} = {};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {[k: number]: string} = {};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{[k: number]: string}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{[k: number]: string}>(),
      restoreFromJsonReflect: () => {
        const v: {[k: number]: string} = {};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {[k: number]: string} = {};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{}, {0: 'x'}, {1: 'x', 2: 'y'}],
        invalid: [{0: 1}, null, 'not object', undefined, {0: null}],
      }),
      getExpectedErrors: () => [
        [{path: ['0'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['0'], expected: 'string'}],
      ],
    },
  },
  // TUPLE — ports `isType` test coverage from mion's
  // packages/run-types/src/nodes/collection/tuple.spec.ts and
  // serialization-suite.ts TUPLES section.
  //
  // Adapters out of scope here (mock / typeErrors / prepareForJson)
  // get their own adapter file; this block carries the
  // isType-relevant assertions and the sample shapes those future
  // adapters will reuse.
  TUPLE: {
    string_number_pair: {
      title: 'Two-element tuple (string plus number)',
      isTypeNotes: [
        'Tuples enforce exact length — both fewer (missing required) and more (excess) elements fail.',
        'Each slot runs the atomic check for its declared type.',
      ],
      isType: () => createIsType<[string, number]>(),
      deserializeIsType: () => deserializeIsType<[string, number]>(),
      isTypeReflect: () => {
        const v: [string, number] = ['hello', 1];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [string, number] = ['hello', 1];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[string, number]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[string, number]>(),
      getTypeErrorsReflect: () => {
        const v: [string, number] = ['hello', 1];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [string, number] = ['hello', 1];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[string, number]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[string, number]>(),
      prepareForJsonReflect: () => {
        const v: [string, number] = ['hello', 1];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [string, number] = ['hello', 1];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[string, number]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[string, number]>(),
      restoreFromJsonReflect: () => {
        const v: [string, number] = ['hello', 1];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [string, number] = ['hello', 1];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          ['hello', 1],
          ['', 0],
        ],
        invalid: [
          [],
          ['hello'],
          ['hello', 1, 'extra'],
          [1, 'hello'],
          'not array',
          null,
          undefined,
          ['hello', NaN], // NaN fails Number.isFinite
          [null, 1],
          ['hello', null],
        ],
      }),
      getExpectedErrors: () => [
        // [] — falls into else (length 0 ≤ 2); both slots are
        // undefined → both fail their atomic checks.
        [
          {path: [0], expected: 'string'},
          {path: [1], expected: 'number'},
        ],
        // ['hello'] — slot 0 OK; slot 1 undefined → number check fails.
        [{path: [1], expected: 'number'}],
        // ['hello', 1, 'extra'] — length > 2 fails outer tuple check.
        [{path: [], expected: 'tuple'}],
        // [1, 'hello'] — both slots wrong type.
        [
          {path: [0], expected: 'string'},
          {path: [1], expected: 'number'},
        ],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [1], expected: 'number'}],
        [{path: [0], expected: 'string'}],
        [{path: [1], expected: 'number'}],
      ],
    },

    full_mion_tuple: {
      title: 'Six-element heterogeneous tuple (mion fixture)',
      description: 'mion tuple.spec.ts "validate tuple"',
      isType: () => createIsType<[Date, number, string, null, string[], bigint]>(),
      deserializeIsType: () => deserializeIsType<[Date, number, string, null, string[], bigint]>(),
      isTypeReflect: () => {
        const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[Date, number, string, null, string[], bigint]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[Date, number, string, null, string[], bigint]>(),
      getTypeErrorsReflect: () => {
        const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[Date, number, string, null, string[], bigint]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[Date, number, string, null, string[], bigint]>(),
      prepareForJsonReflect: () => {
        const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[Date, number, string, null, string[], bigint]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[Date, number, string, null, string[], bigint]>(),
      restoreFromJsonReflect: () => {
        const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [Date, number, string, null, string[], bigint] = [new Date(), 123, 'hello', null, ['a'], 1n];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123)]],
        invalid: [
          [new Date(), 123, 'hello', null, ['a', 'b', 'c']], // missing 6th elem
          [new Date(), 123, 'hello', null, ['a', 'b', 'c'], BigInt(123), 34], // extra
          [new Date(), 123, 'hello', null, ['a', 'b', 'c'], 'not bigint'],
          null,
          undefined,
          [new Date('invalid'), 123, 'hello', null, ['a'], 1n], // Invalid Date
          [new Date(), NaN, 'hello', null, ['a'], 1n], // NaN
          [new Date(), 123, 'hello', undefined, ['a'], 1n], // undefined ≠ null literal
        ],
      }),
      getExpectedErrors: () => [
        [{path: [5], expected: 'bigint'}],
        [{path: [], expected: 'tuple'}],
        [{path: [5], expected: 'bigint'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [0], expected: 'date'}],
        [{path: [1], expected: 'number'}],
        [{path: [3], expected: 'null'}],
      ],
    },

    tuple_with_optional: {
      title: 'Tuple with trailing optional elements',
      description: 'mion tuple.spec.ts "validate tuple with optional parameters"',
      isTypeNotes:
        'Optional tuple slots may be absent OR explicitly `undefined`. Trailing-only — TS grammar disallows `[A, B?, C]` (required after optional).',
      isType: () => createIsType<[number, bigint?, boolean?, number?]>(),
      deserializeIsType: () => deserializeIsType<[number, bigint?, boolean?, number?]>(),
      isTypeReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[number, bigint?, boolean?, number?]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[number, bigint?, boolean?, number?]>(),
      getTypeErrorsReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[number, bigint?, boolean?, number?]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[number, bigint?, boolean?, number?]>(),
      prepareForJsonReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[number, bigint?, boolean?, number?]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[number, bigint?, boolean?, number?]>(),
      restoreFromJsonReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[3, undefined, true, 4], [3], [3, 1n], [3, 1n, false]],
        invalid: [[], [3, 'not bigint'], [3, 1n, false, 4, 'extra'], 'not array', null, undefined, [NaN], ['not number']],
      }),
      getExpectedErrors: () => [
        // [] — slot 0 (required number) undefined → fails.
        [{path: [0], expected: 'number'}],
        // [3, 'not bigint'] — slot 1 is non-undefined non-bigint.
        [{path: [1], expected: 'bigint'}],
        // [3, 1n, false, 4, 'extra'] — length 5 > 4.
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [0], expected: 'number'}],
        [{path: [0], expected: 'number'}],
      ],
    },

    nested_tuple_in_array: {
      title: 'Tuple as array element (tuple inside array dependency call)',
      description: 'array of tuples — exercises tuple inside array dependency call',
      isType: () => createIsType<[string, number][]>(),
      deserializeIsType: () => deserializeIsType<[string, number][]>(),
      isTypeReflect: () => {
        const v: [string, number][] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [string, number][] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[string, number][]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[string, number][]>(),
      getTypeErrorsReflect: () => {
        const v: [string, number][] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [string, number][] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[string, number][]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[string, number][]>(),
      prepareForJsonReflect: () => {
        const v: [string, number][] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [string, number][] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[string, number][]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[string, number][]>(),
      restoreFromJsonReflect: () => {
        const v: [string, number][] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [string, number][] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          [],
          [['a', 1]],
          [
            ['a', 1],
            ['b', 2],
          ],
        ],
        invalid: [[['a', 'b']], [['a']], ['not tuple'], null, undefined, [['a', NaN]], [[null, 1]]],
      }),
      getExpectedErrors: () => [
        // [['a', 'b']] — outer array, inner [a, b]: slot 1 'b' not number.
        [{path: [0, 1], expected: 'number'}],
        // [['a']] — outer array, inner ['a']: slot 0 OK, slot 1 undefined fails number.
        [{path: [0, 1], expected: 'number'}],
        // ['not tuple'] — element 0 'not tuple' fails tuple check.
        [{path: [0], expected: 'tuple'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        // [['a', NaN]] — slot 1 NaN fails number.
        [{path: [0, 1], expected: 'number'}],
        // [[null, 1]] — slot 0 null fails string.
        [{path: [0, 0], expected: 'string'}],
      ],
    },

    // ---- DEFERRED — features that aren't yet ported ----

    tuple_rest: {
      title: 'Tuple with a trailing rest segment',
      description:
        "mion tuple.spec.ts 'validate tuple with rest parameter'. Rest TupleMembers (Flags=['rest']) emit a for-loop starting at the member's Position and iterating to v.length, validating every element against the wrapped type. The tuple's length-bound check is skipped (rest absorbs extras).",
      isTypeNotes:
        'A trailing rest segment absorbs any number of trailing elements (including zero). Each trailing element must satisfy the rest type.',
      isType: () => createIsType<[number, ...string[]]>(),
      deserializeIsType: () => deserializeIsType<[number, ...string[]]>(),
      isTypeReflect: () => {
        const v: [number, ...string[]] = [3];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [number, ...string[]] = [3];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[number, ...string[]]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[number, ...string[]]>(),
      getTypeErrorsReflect: () => {
        const v: [number, ...string[]] = [3];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [number, ...string[]] = [3];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[number, ...string[]]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[number, ...string[]]>(),
      prepareForJsonReflect: () => {
        const v: [number, ...string[]] = [3];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [number, ...string[]] = [3];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[number, ...string[]]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[number, ...string[]]>(),
      restoreFromJsonReflect: () => {
        const v: [number, ...string[]] = [3];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [number, ...string[]] = [3];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[3], [3, 'a'], [3, 'a', 'b', 'c']],
        invalid: [[3, 'a', 4], ['not number'], [], 'not array', [3, 1], null, undefined, [NaN, 'a'], [3, null]],
      }),
      getExpectedErrors: () => [
        // [3, 'a', 4] — slot 0 OK; rest at iVar=1 'a' OK; iVar=2 4 fails string.
        [{path: [2], expected: 'string'}],
        // ['not number'] — slot 0 'not number' fails; rest iterates 0 times.
        [{path: [0], expected: 'number'}],
        // [] — slot 0 missing → number check fails on undefined.
        [{path: [0], expected: 'number'}],
        [{path: [], expected: 'tuple'}],
        // [3, 1] — slot 0 OK; rest iVar=1 1 fails string.
        [{path: [1], expected: 'string'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        // [NaN, 'a'] — slot 0 NaN fails; rest at 1 'a' OK.
        [{path: [0], expected: 'number'}],
        // [3, null] — slot 0 OK; rest iVar=1 null fails string.
        [{path: [1], expected: 'string'}],
      ],
    },

    tuple_circular: {
      title: 'Self-referential tuple via trailing optional self-ref',
      description:
        'mion tuple.spec.ts circular tuple. Same mechanism as circular array — Tuple is always non-inlined, the self-recursive dependency call closes the cycle via the isSelf branch.',
      isType: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createIsType<TupleCircular>();
      },
      deserializeIsType: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return deserializeIsType<TupleCircular>();
      },
      isTypeReflect: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createGetTypeErrors<TupleCircular>();
      },
      deserializeGetTypeErrors: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return deserializeGetTypeErrors<TupleCircular>();
      },
      getTypeErrorsReflect: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createPrepareForJson<TupleCircular>();
      },
      deserializePrepareForJson: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return deserializePrepareForJson<TupleCircular>();
      },
      prepareForJsonReflect: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return createRestoreFromJson<TupleCircular>();
      },
      deserializeRestoreFromJson: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        return deserializeRestoreFromJson<TupleCircular>();
      },
      restoreFromJsonReflect: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        type TupleCircular = [Date, number, string, null, string[], bigint, TupleCircular?];
        const v: TupleCircular = [new Date(), 1, 'a', null, [], 1n];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => {
        const tc: any = [new Date(), 1, 'a', null, [], 1n];
        const tcRec: any = [new Date(), 1, 'a', null, [], 1n, [new Date(), 1, 'a', null, [], 1n]];
        return {
          valid: [tc, tcRec],
          invalid: [
            [],
            [new Date(), 1, 'a', null, [], 'not bigint'],
            'not array',
            null,
            undefined,
            [new Date('invalid'), 1, 'a', null, [], 1n],
            [new Date(), NaN, 'a', null, [], 1n],
          ],
        };
      },
      getExpectedErrors: () => [
        // [] — every required slot fails atomic check (slot 6 is optional, skipped).
        [
          {path: [0], expected: 'date'},
          {path: [1], expected: 'number'},
          {path: [2], expected: 'string'},
          {path: [3], expected: 'null'},
          {path: [4], expected: 'array'},
          {path: [5], expected: 'bigint'},
        ],
        [{path: [5], expected: 'bigint'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [0], expected: 'date'}],
        [{path: [1], expected: 'number'}],
      ],
    },

    tuple_multiple_trailing_optionals: {
      title: 'Tuple with multiple trailing optional slots',
      description:
        "Multiple trailing optionals — TS grammar requires optionals to come after required elements (`[A, B?, C]` is a TS error), so the canonical 'optional middle' form is a chain of trailing optionals. Each TupleMember.Optional flag fires its own `(v[i] === undefined || childCheck)` wrap independently.",
      isType: () => createIsType<[number, bigint?, boolean?, number?]>(),
      deserializeIsType: () => deserializeIsType<[number, bigint?, boolean?, number?]>(),
      isTypeReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[number, bigint?, boolean?, number?]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[number, bigint?, boolean?, number?]>(),
      getTypeErrorsReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[number, bigint?, boolean?, number?]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[number, bigint?, boolean?, number?]>(),
      prepareForJsonReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[number, bigint?, boolean?, number?]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[number, bigint?, boolean?, number?]>(),
      restoreFromJsonReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [number, bigint?, boolean?, number?] = [3];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          [3],
          [3, 1n],
          [3, 1n, true],
          [3, 1n, true, 4],
          [3, undefined, true, 4], // explicit undefined in the middle
          [3, 1n, undefined, 4],
          [3, undefined, undefined, 4],
        ],
        invalid: [
          [], // missing required first
          [3, 'not bigint'], // wrong type at optional slot
          [3, 1n, true, 4, 'extra'], // excess args
          'not array',
          null,
          undefined,
          [NaN], // NaN at required first
          [3, 1n, 'not boolean'], // wrong type at second optional
        ],
      }),
      getExpectedErrors: () => [
        [{path: [0], expected: 'number'}],
        [{path: [1], expected: 'bigint'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [0], expected: 'number'}],
        // [3, 1n, 'not boolean'] — slot 2 (boolean?) is non-undefined
        // non-boolean. The resolver expands `boolean?` to a union
        // (undefined | true | false), so the error is reported as
        // 'union' not 'boolean'.
        [{path: [2], expected: 'union'}],
      ],
    },

    tuple_named_labels: {
      title: 'Tuple with named element labels (labels erased at runtime)',
      description:
        "Named tuple labels — `[name: string, age: number]` is the same shape as `[string, number]` at runtime (labels are TS-only metadata, erased at emit). Carried as a regression check that label syntax doesn't affect the validator shape.",
      isType: () => createIsType<[name: string, age: number]>(),
      deserializeIsType: () => deserializeIsType<[name: string, age: number]>(),
      isTypeReflect: () => {
        const v: [name: string, age: number] = ['Alice', 30];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [name: string, age: number] = ['Alice', 30];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[name: string, age: number]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[name: string, age: number]>(),
      getTypeErrorsReflect: () => {
        const v: [name: string, age: number] = ['Alice', 30];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [name: string, age: number] = ['Alice', 30];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[name: string, age: number]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[name: string, age: number]>(),
      prepareForJsonReflect: () => {
        const v: [name: string, age: number] = ['Alice', 30];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [name: string, age: number] = ['Alice', 30];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[name: string, age: number]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[name: string, age: number]>(),
      restoreFromJsonReflect: () => {
        const v: [name: string, age: number] = ['Alice', 30];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [name: string, age: number] = ['Alice', 30];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          ['Alice', 30],
          ['', 0],
        ],
        invalid: [[], ['Alice'], ['Alice', '30'], [30, 'Alice'], null, 'not array', undefined, ['Alice', NaN], [null, 30]],
      }),
      getExpectedErrors: () => [
        [
          {path: [0], expected: 'string'},
          {path: [1], expected: 'number'},
        ],
        [{path: [1], expected: 'number'}],
        [{path: [1], expected: 'number'}],
        [
          {path: [0], expected: 'string'},
          {path: [1], expected: 'number'},
        ],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [1], expected: 'number'}],
        [{path: [0], expected: 'string'}],
      ],
    },

    tuple_with_non_serializable: {
      title: 'Tuple with a function slot (must be undefined)',
      description:
        "mion serialization-suite TUPLES.tuple_with_non_serializable. Function-typed tuple members emit `v[i] === undefined` per mion's non-serializable handling. The function slot must be absent or explicitly undefined; any other value (a real function, a string, …) fails.",
      isTypeNotes: [
        'TS DIVERGENCE: A function-typed tuple slot must be MISSING or explicitly `undefined`. A real function FAILS the check.',
        'This is the opposite of the object-property case (where function-typed props are skipped entirely): tuples enforce `=== undefined` because tuple position is structural.',
      ],
      isType: () => createIsType<[number, () => any]>(),
      deserializeIsType: () => deserializeIsType<[number, () => any]>(),
      isTypeReflect: () => {
        const v: [number, () => any] = [3, () => null];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [number, () => any] = [3, () => null];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[number, () => any]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[number, () => any]>(),
      getTypeErrorsReflect: () => {
        const v: [number, () => any] = [3, () => null];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [number, () => any] = [3, () => null];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[number, () => any]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[number, () => any]>(),
      prepareForJsonReflect: () => {
        const v: [number, () => any] = [3, () => null];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [number, () => any] = [3, () => null];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[number, () => any]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[number, () => any]>(),
      restoreFromJsonReflect: () => {
        const v: [number, () => any] = [3, () => null];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [number, () => any] = [3, () => null];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        // `[3]` is valid — v[1] is undefined which satisfies the
        // `v[1] === undefined` check the function slot emits.
        valid: [[3, undefined], [3]],
        invalid: [
          [3, () => null],
          [3, 42],
          ['not number'],
          'not array',
          null,
          undefined,
          [3, null], // null is NOT undefined — strict `=== undefined` check
          [NaN, undefined],
        ],
      }),
      getExpectedErrors: () => [
        [{path: [1], expected: 'undefined'}],
        [{path: [1], expected: 'undefined'}],
        [{path: [0], expected: 'number'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [1], expected: 'undefined'}],
        [{path: [0], expected: 'number'}],
      ],
    },

    empty_tuple: {
      title: 'Empty tuple `[]` (only the empty array passes)',
      description:
        'Zero-length tuple — the validator accepts only `[]` (Array.isArray + length === 0). Edge case for the tuple emit; mirrors mion\'s `children.length === 0` branch.',
      isType: () => createIsType<[]>(),
      deserializeIsType: () => deserializeIsType<[]>(),
      isTypeReflect: () => {
        const v: [] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[]>(),
      getTypeErrorsReflect: () => {
        const v: [] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[]>(),
      prepareForJsonReflect: () => {
        const v: [] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[]>(),
      restoreFromJsonReflect: () => {
        const v: [] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [] = [];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [[]],
        invalid: [['extra'], [1], null, undefined, {}, 'not array', [null]],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
      ],
    },

    single_element_tuple: {
      title: 'Single-element tuple `[T]`',
      description:
        'One-slot tuple — corner case for the length-bound check (length must be exactly 1 modulo optional / rest). Exercises the same emit shape as multi-element tuples but with a single member.',
      isType: () => createIsType<[string]>(),
      deserializeIsType: () => deserializeIsType<[string]>(),
      isTypeReflect: () => {
        const v: [string] = ['x'];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: [string] = ['x'];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<[string]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<[string]>(),
      getTypeErrorsReflect: () => {
        const v: [string] = ['x'];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: [string] = ['x'];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<[string]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<[string]>(),
      prepareForJsonReflect: () => {
        const v: [string] = ['x'];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: [string] = ['x'];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<[string]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<[string]>(),
      restoreFromJsonReflect: () => {
        const v: [string] = ['x'];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: [string] = ['x'];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [['hello'], ['']],
        invalid: [[], [42], ['hello', 'extra'], null, undefined, [null], 'not array'],
      }),
      getExpectedErrors: () => [
        // [] — length 0, falls into else; slot 0 (undefined) fails string.
        [{path: [0], expected: 'string'}],
        // [42] — slot 0 wrong type.
        [{path: [0], expected: 'string'}],
        // ['hello', 'extra'] — length 2 > 1.
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [0], expected: 'string'}],
        [{path: [], expected: 'tuple'}],
      ],
    },

    readonly_tuple: {
      title: 'Readonly tuple (readonly [T, U])',
      description:
        '`readonly [T, U]` — readonly modifier on a tuple type. As with arrays, the readonly bit is TS-only and erased at runtime; the validator is identical to the bare `[T, U]` shape.',
      isType: () => createIsType<readonly [string, number]>(),
      deserializeIsType: () => deserializeIsType<readonly [string, number]>(),
      isTypeReflect: () => {
        const v: readonly [string, number] = ['x', 1];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: readonly [string, number] = ['x', 1];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<readonly [string, number]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<readonly [string, number]>(),
      getTypeErrorsReflect: () => {
        const v: readonly [string, number] = ['x', 1];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: readonly [string, number] = ['x', 1];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<readonly [string, number]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<readonly [string, number]>(),
      prepareForJsonReflect: () => {
        const v: readonly [string, number] = ['x', 1];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: readonly [string, number] = ['x', 1];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<readonly [string, number]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<readonly [string, number]>(),
      restoreFromJsonReflect: () => {
        const v: readonly [string, number] = ['x', 1];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: readonly [string, number] = ['x', 1];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          ['x', 1],
          ['', 0],
        ],
        invalid: [[], ['x'], [1, 'x'], null, undefined, 'not array', ['x', 1, 'extra']],
      }),
      getExpectedErrors: () => [
        [
          {path: [0], expected: 'string'},
          {path: [1], expected: 'number'},
        ],
        [{path: [1], expected: 'number'}],
        [
          {path: [0], expected: 'string'},
          {path: [1], expected: 'number'},
        ],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
        [{path: [], expected: 'tuple'}],
      ],
    },
  },

  // UNION — ports `isType` test coverage from
  // packages/run-types/src/nodes/collection/union.spec.ts and
  // serialization-suite.ts UNIONS section.
  //
  // Intersection has its own (deferred) entry — mion resolves
  // intersections to ObjectLiteral at compile time, so the isType
  // emit only needs to know about ObjectLiteral.
  UNION: {
    atomic_union: {
      title: 'Union of common atomic types (with Date and bigint)',
      description: 'mion union.spec.ts "validate union" — Atomic Union suite',
      isTypeNotes: [
        'Validates as an OR-chain — first matching arm wins.',
        'Each arm runs its full atomic check: numbers reject NaN / Infinity, Dates reject Invalid Date, etc.',
      ],
      isType: () => createIsType<Date | number | string | null | bigint>(),
      deserializeIsType: () => deserializeIsType<Date | number | string | null | bigint>(),
      isTypeReflect: () => {
        const v: Date | number | string | null | bigint = 123;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Date | number | string | null | bigint = 123;
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Date | number | string | null | bigint>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Date | number | string | null | bigint>(),
      getTypeErrorsReflect: () => {
        const v: Date | number | string | null | bigint = 123;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Date | number | string | null | bigint = 123;
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<Date | number | string | null | bigint>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Date | number | string | null | bigint>(),
      prepareForJsonReflect: () => {
        const v: Date | number | string | null | bigint = 123;
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: Date | number | string | null | bigint = 123;
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<Date | number | string | null | bigint>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Date | number | string | null | bigint>(),
      restoreFromJsonReflect: () => {
        const v: Date | number | string | null | bigint = 123;
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: Date | number | string | null | bigint = 123;
        return deserializeRestoreFromJson(v);
      },
      // Round-trip skipped (phase 7) — this union contains transforming or non-serializable members; the noop union emit cannot reconstruct them. Marks the case for the round-trip adapter without affecting validator coverage.
      getRoundTripValid: () => [],
      getSamples: () => ({
        valid: [new Date(), 123, 'hello', null, 1n],
        invalid: [{}, [], true, undefined, new Date('invalid'), Infinity, Symbol(), () => null],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    string_literal_union: {
      title: 'Union of string literals (case-sensitive)',
      description: 'mion union.spec.ts "validate union discriminator string"',
      isTypeNotes: 'Literal string unions are case-sensitive. Only the exact strings declared in the union pass.',
      isType: () => createIsType<'UNO' | 'DOS' | 'TRES'>(),
      deserializeIsType: () => deserializeIsType<'UNO' | 'DOS' | 'TRES'>(),
      isTypeReflect: () => {
        const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<'UNO' | 'DOS' | 'TRES'>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<'UNO' | 'DOS' | 'TRES'>(),
      getTypeErrorsReflect: () => {
        const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<'UNO' | 'DOS' | 'TRES'>(),
      deserializePrepareForJson: () => deserializePrepareForJson<'UNO' | 'DOS' | 'TRES'>(),
      prepareForJsonReflect: () => {
        const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<'UNO' | 'DOS' | 'TRES'>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<'UNO' | 'DOS' | 'TRES'>(),
      restoreFromJsonReflect: () => {
        const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: 'UNO' | 'DOS' | 'TRES' = 'UNO';
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: ['UNO', 'DOS', 'TRES'],
        invalid: ['INVALID', 'uno', '', 42, null, undefined, true, 'Uno', {}],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    string_or_number: {
      title: 'Two-arm union of string and number',
      isType: () => createIsType<string | number>(),
      deserializeIsType: () => deserializeIsType<string | number>(),
      isTypeReflect: () => {
        const v: string | number = 'hello';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: string | number = 'hello';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<string | number>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<string | number>(),
      getTypeErrorsReflect: () => {
        const v: string | number = 'hello';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: string | number = 'hello';
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<string | number>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string | number>(),
      prepareForJsonReflect: () => {
        const v: string | number = 'hello';
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: string | number = 'hello';
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<string | number>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string | number>(),
      restoreFromJsonReflect: () => {
        const v: string | number = 'hello';
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: string | number = 'hello';
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: ['hello', 42, 0, ''],
        invalid: [null, undefined, true, [], {}, NaN, Infinity, BigInt(1)],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    union_of_array_types: {
      title: 'Union of array types (whole-array dispatch)',
      description: 'mion union.spec.ts "Union Arr"',
      isTypeNotes:
        'Mixed-element arrays (e.g., `["a", 1]`) FAIL — no single arm matches the whole array. The union is over array types, not element types.',
      isType: () => createIsType<string[] | number[] | boolean[]>(),
      deserializeIsType: () => deserializeIsType<string[] | number[] | boolean[]>(),
      isTypeReflect: () => {
        const v: string[] | number[] | boolean[] = ['a'];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: string[] | number[] | boolean[] = ['a'];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<string[] | number[] | boolean[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<string[] | number[] | boolean[]>(),
      getTypeErrorsReflect: () => {
        const v: string[] | number[] | boolean[] = ['a'];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: string[] | number[] | boolean[] = ['a'];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<string[] | number[] | boolean[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string[] | number[] | boolean[]>(),
      prepareForJsonReflect: () => {
        const v: string[] | number[] | boolean[] = ['a'];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: string[] | number[] | boolean[] = ['a'];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<string[] | number[] | boolean[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string[] | number[] | boolean[]>(),
      restoreFromJsonReflect: () => {
        const v: string[] | number[] | boolean[] = ['a'];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: string[] | number[] | boolean[] = ['a'];
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [['a'], [1], [true, false], [], ['a', 'b']],
        invalid: [['a', 1], [1, 'a'], 'not array', null, undefined, [Infinity], [null], [BigInt(1)]],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    array_of_union: {
      title: 'Array whose element type is a union',
      description: 'mion union.spec.ts "Arr with union of types"',
      isTypeNotes:
        'Each element runs the full union OR-chain independently. Mixed-type arrays pass as long as every element matches some arm.',
      isType: () => createIsType<(string | bigint | boolean | Date)[]>(),
      deserializeIsType: () => deserializeIsType<(string | bigint | boolean | Date)[]>(),
      isTypeReflect: () => {
        const v: (string | bigint | boolean | Date)[] = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: (string | bigint | boolean | Date)[] = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<(string | bigint | boolean | Date)[]>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<(string | bigint | boolean | Date)[]>(),
      getTypeErrorsReflect: () => {
        const v: (string | bigint | boolean | Date)[] = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: (string | bigint | boolean | Date)[] = [];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<(string | bigint | boolean | Date)[]>(),
      deserializePrepareForJson: () => deserializePrepareForJson<(string | bigint | boolean | Date)[]>(),
      prepareForJsonReflect: () => {
        const v: (string | bigint | boolean | Date)[] = [];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: (string | bigint | boolean | Date)[] = [];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<(string | bigint | boolean | Date)[]>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<(string | bigint | boolean | Date)[]>(),
      restoreFromJsonReflect: () => {
        const v: (string | bigint | boolean | Date)[] = [];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: (string | bigint | boolean | Date)[] = [];
        return deserializeRestoreFromJson(v);
      },
      // Round-trip skipped (phase 7) — this union contains transforming or non-serializable members; the noop union emit cannot reconstruct them. Marks the case for the round-trip adapter without affecting validator coverage.
      getRoundTripValid: () => [],
      getSamples: () => ({
        valid: [[1n, 'b', new Date(), true]],
        invalid: [
          ['a', false, 2], // 2 is a number, not bigint
          null,
          undefined,
          [new Date('invalid')], // Invalid Date inside union
          [null], // null not in union
          [{}],
        ],
      }),
      getExpectedErrors: () => [
        // Element at index 2 (the number 2) fails the union check.
        [{path: [2], expected: 'union'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'union'}],
        [{path: [0], expected: 'union'}],
        [{path: [0], expected: 'union'}],
      ],
    },

    // ---- DEFERRED ----

    union_of_object_shapes: {
      title: 'Union of disjoint object shapes',
      description:
        "mion union.spec.ts 'Union Obj'. Object-typed union members go through the dependency-call layer with the shared `typeof === 'object' && !== null` guard lifted out of the OR-chain.",
      isType: () => createIsType<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
      deserializeIsType: () => deserializeIsType<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
      isTypeReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
      getTypeErrorsReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
      prepareForJsonReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{a: string; aa: boolean} | {b: number} | {c: bigint}>(),
      restoreFromJsonReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint} = {b: 1};
        return deserializeRestoreFromJson(v);
      },
      // Round-trip skipped (phase 7) — this union contains transforming or non-serializable members; the noop union emit cannot reconstruct them. Marks the case for the round-trip adapter without affecting validator coverage.
      getRoundTripValid: () => [],
      getSamples: () => ({
        // mion union.spec.ts uses loose matching — `{a, b, c}` passes
        // because `{b: number}` is satisfied. Our emit accepts any
        // object that satisfies AT LEAST one member's required props.
        valid: [{a: 'x', aa: true}, {b: 1}, {c: 1n}, {a: 'x', aa: true, b: 1}],
        invalid: [{a: 'x'}, {}, 'not object', null, [], 42, undefined, {b: 'not number'}, {c: 1}],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    discriminated_union: {
      title: 'Discriminated union (shared kind literal, different payloads)',
      description:
        'mion union.spec.ts "Union with discriminator property" — the OR-chain is semantically correct; the discriminator-aware optimization (early-return on the discriminator literal) is a separate emit-shape concern handled later.',
      isTypeNotes:
        'Each arm is validated in full; the discriminator literal narrows which arm matches. A value passes if it fully satisfies AT LEAST ONE arm.',
      isType: () => createIsType<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
      deserializeIsType: () => deserializeIsType<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
      isTypeReflect: () => {
        const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
      getTypeErrorsReflect: () => {
        const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
      prepareForJsonReflect: () => {
        const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{kind: 'a'; n: number} | {kind: 'b'; s: string}>(),
      restoreFromJsonReflect: () => {
        const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {kind: 'a'; n: number} | {kind: 'b'; s: string} = {kind: 'a', n: 1};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {kind: 'a', n: 1},
          {kind: 'b', s: 'hello'},
        ],
        invalid: [
          {kind: 'c', n: 1},
          {kind: 'a', n: 'not number'},
          {n: 1},
          null,
          'not object',
          undefined,
          {kind: 'a'}, // missing n
          {kind: 'a', n: NaN},
          {kind: 'b'}, // missing s
        ],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    circular_union: {
      title: 'Self-referential union via object and array arms',
      description:
        'mion union.spec.ts "Union circular". Handled via always-non-inlined Union + Object + Array (no IsCircular detection needed; the dependency-call layer terminates via the lazy-init two-phase cache registration).',
      isTypeNotes: 'Self-recursive unions traverse the cycle until the input value bottoms out at an atomic arm.',
      isType: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createIsType<UnionC>();
      },
      deserializeIsType: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return deserializeIsType<UnionC>();
      },
      isTypeReflect: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        const v: UnionC = 'hello';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        const v: UnionC = 'hello';
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createGetTypeErrors<UnionC>();
      },
      deserializeGetTypeErrors: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return deserializeGetTypeErrors<UnionC>();
      },
      getTypeErrorsReflect: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        const v: UnionC = 'hello';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        const v: UnionC = 'hello';
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createPrepareForJson<UnionC>();
      },
      deserializePrepareForJson: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return deserializePrepareForJson<UnionC>();
      },
      prepareForJsonReflect: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        const v: UnionC = 'hello';
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        const v: UnionC = 'hello';
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return createRestoreFromJson<UnionC>();
      },
      deserializeRestoreFromJson: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        return deserializeRestoreFromJson<UnionC>();
      },
      restoreFromJsonReflect: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        const v: UnionC = 'hello';
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        type UnionC = Date | number | string | {a?: UnionC; b?: string} | UnionC[];
        const v: UnionC = 'hello';
        return deserializeRestoreFromJson(v);
      },
      // Round-trip skipped (phase 7) — this union contains transforming or non-serializable members; the noop union emit cannot reconstruct them. Marks the case for the round-trip adapter without affecting validator coverage.
      getRoundTripValid: () => [],
      getSamples: () => ({
        valid: [new Date(), 123, 'hello', {}, {a: {a: {}}}, {b: 'hello'}, [], [{a: {}}, [123, 'hello']]],
        invalid: [true, null, undefined, {a: true}, [true], new Date('invalid'), Infinity, Symbol()],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    union_with_methods: {
      title: 'Union of object arms each carrying a method',
      description:
        'mion union.spec.ts "Union with objects containing methods" — methods are skipped from each branch via the property-emit function-skip rule (the AND chain inside each object reduces to the data-only props).',
      isType: () => createIsType<{name: string; getName(): string} | {age: number; getAge(): number}>(),
      deserializeIsType: () => deserializeIsType<{name: string; getName(): string} | {age: number; getAge(): number}>(),
      isTypeReflect: () => {
        const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
          name: 'x',
          getName: () => 'x',
        };
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
          name: 'x',
          getName: () => 'x',
        };
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{name: string; getName(): string} | {age: number; getAge(): number}>(),
      deserializeGetTypeErrors: () =>
        deserializeGetTypeErrors<{name: string; getName(): string} | {age: number; getAge(): number}>(),
      getTypeErrorsReflect: () => {
        const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
          name: 'x',
          getName: () => 'x',
        };
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
          name: 'x',
          getName: () => 'x',
        };
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{name: string; getName(): string} | {age: number; getAge(): number}>(),
      deserializePrepareForJson: () =>
        deserializePrepareForJson<{name: string; getName(): string} | {age: number; getAge(): number}>(),
      prepareForJsonReflect: () => {
        const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
          name: 'x',
          getName: () => 'x',
        };
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
          name: 'x',
          getName: () => 'x',
        };
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{name: string; getName(): string} | {age: number; getAge(): number}>(),
      deserializeRestoreFromJson: () =>
        deserializeRestoreFromJson<{name: string; getName(): string} | {age: number; getAge(): number}>(),
      restoreFromJsonReflect: () => {
        const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
          name: 'x',
          getName: () => 'x',
        };
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {name: string; getName(): string} | {age: number; getAge(): number} = {
          name: 'x',
          getName: () => 'x',
        };
        return deserializeRestoreFromJson(v);
      },
      // Round-trip skipped (phase 7) — this union contains transforming or non-serializable members; the noop union emit cannot reconstruct them. Marks the case for the round-trip adapter without affecting validator coverage.
      getRoundTripValid: () => [],
      getSamples: () => ({
        valid: [{name: 'x', getName: () => 'x'}, {age: 1, getAge: () => 1}, {name: 'x'}, {age: 1}],
        invalid: [{}, null, 'not object', [], undefined, true, 42, {name: 1}, {age: 'x'}],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    intersection_to_object: {
      title: 'Intersection of object shapes (resolved to one merged shape)',
      description:
        'mion intersection.spec.ts — tsgo / deepkit resolves intersections to ObjectLiteral at the type-checker level, so the cache never carries a KindIntersection that needs validation. Runtime behavior matches `{a: string; b: number}` byte-for-byte.',
      isType: () => createIsType<{a: string} & {b: number}>(),
      deserializeIsType: () => deserializeIsType<{a: string} & {b: number}>(),
      isTypeReflect: () => {
        const v: {a: string} & {b: number} = {a: 'x', b: 1};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {a: string} & {b: number} = {a: 'x', b: 1};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{a: string} & {b: number}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: string} & {b: number}>(),
      getTypeErrorsReflect: () => {
        const v: {a: string} & {b: number} = {a: 'x', b: 1};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {a: string} & {b: number} = {a: 'x', b: 1};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{a: string} & {b: number}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{a: string} & {b: number}>(),
      prepareForJsonReflect: () => {
        const v: {a: string} & {b: number} = {a: 'x', b: 1};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {a: string} & {b: number} = {a: 'x', b: 1};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{a: string} & {b: number}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{a: string} & {b: number}>(),
      restoreFromJsonReflect: () => {
        const v: {a: string} & {b: number} = {a: 'x', b: 1};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {a: string} & {b: number} = {a: 'x', b: 1};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {a: 'x', b: 1},
          {a: '', b: 0},
        ],
        invalid: [
          {a: 'x'},
          {b: 1},
          null,
          {a: 1, b: 1},
          {a: 'x', b: 'not number'},
          undefined,
          {a: 'x', b: NaN},
          {},
        ],
      }),
      // Intersection resolved to `{a: string; b: number}` — typeErrors
      // is the merged object shape's per-property check.
      getExpectedErrors: () => [
        [{path: ['b'], expected: 'number'}],
        [{path: ['a'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['a'], expected: 'string'}],
        [{path: ['b'], expected: 'number'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['b'], expected: 'number'}],
        [
          {path: ['a'], expected: 'string'},
          {path: ['b'], expected: 'number'},
        ],
      ],
    },

    // ---- additions migrated 1:1 from mion union.spec.ts ----

    union_with_index_arm: {
      title: 'Union where one arm carries an index signature',
      description:
        "mion union.spec.ts 'validate an union with index property' — arm carries a named prop AND an index signature; index-typed extras are accepted alongside the named prop.",
      isType: () => createIsType<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
      deserializeIsType: () => deserializeIsType<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
      isTypeReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
      deserializeGetTypeErrors: () =>
        deserializeGetTypeErrors<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
      getTypeErrorsReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
      deserializePrepareForJson: () =>
        deserializePrepareForJson<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
      prepareForJsonReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
      deserializeRestoreFromJson: () =>
        deserializeRestoreFromJson<{a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint}>(),
      restoreFromJsonReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {a: string; aa: boolean} | {b: number} | {c: bigint; [key: string]: bigint} = {b: 123};
        return deserializeRestoreFromJson(v);
      },
      // Round-trip skipped (phase 7) — this union contains transforming or non-serializable members; the noop union emit cannot reconstruct them. Marks the case for the round-trip adapter without affecting validator coverage.
      getRoundTripValid: () => [],
      getSamples: () => ({
        valid: [{a: 'hello', aa: true}, {b: 123}, {c: 1n, d: 2n}],
        invalid: [
          {a: 'hello'}, // missing aa, no b, no c
          {b: 'hello'}, // wrong type for b
          {a: 'hello', d: 'extra'}, // doesn't match any arm
          {c: 1n, d: 'hello'}, // index value wrong type
          null,
          undefined,
          {}, // empty matches no arm
          {b: NaN}, // b is number but NaN fails
        ],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    union_same_prop_different_types: {
      title: 'Discriminated union sharing one prop with arm-dependent type',
      description:
        "mion union.spec.ts 'validate union same prop with different types' — same prop name (`prop`) carries an arm-dependent value type, gated by the literal-string discriminator.",
      isType: () => createIsType<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
      deserializeIsType: () => deserializeIsType<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
      isTypeReflect: () => {
        const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
          type: 'a',
          prop: true,
        };
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
          type: 'a',
          prop: true,
        };
        return deserializeIsType(v);
      },
      getTypeErrors: () =>
        createGetTypeErrors<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
      deserializeGetTypeErrors: () =>
        deserializeGetTypeErrors<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
      getTypeErrorsReflect: () => {
        const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
          type: 'a',
          prop: true,
        };
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
          type: 'a',
          prop: true,
        };
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () =>
        createPrepareForJson<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
      deserializePrepareForJson: () =>
        deserializePrepareForJson<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
      prepareForJsonReflect: () => {
        const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
          type: 'a',
          prop: true,
        };
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
          type: 'a',
          prop: true,
        };
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () =>
        createRestoreFromJson<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
      deserializeRestoreFromJson: () =>
        deserializeRestoreFromJson<{type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string}>(),
      restoreFromJsonReflect: () => {
        const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
          type: 'a',
          prop: true,
        };
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {type: 'a'; prop: boolean} | {type: 'b'; prop: number} | {type: 'c'; prop: string} = {
          type: 'a',
          prop: true,
        };
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [
          {type: 'a', prop: true},
          {type: 'b', prop: 123},
          {type: 'c', prop: 'hello'},
        ],
        invalid: [
          {type: 'a', prop: 123},
          {type: 'b', prop: 'hello'},
          {type: 'c', prop: true},
          null,
          undefined,
          {type: 'a'}, // missing prop
          {prop: true}, // missing type
          {type: 'd', prop: true}, // invalid discriminator
        ],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    union_mixed_arrays_and_objects: {
      title: 'Union mixing array types and object shapes',
      description:
        "mion union.spec.ts 'Union Mixed' — arrays and objects in the same union; the OR-chain dispatches on shape (Array.isArray vs object typeof).",
      isType: () =>
        createIsType<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      deserializeIsType: () =>
        deserializeIsType<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      isTypeReflect: () => {
        const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
          'a',
          'b',
          'c',
        ];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
          'a',
          'b',
          'c',
        ];
        return deserializeIsType(v);
      },
      getTypeErrors: () =>
        createGetTypeErrors<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      deserializeGetTypeErrors: () =>
        deserializeGetTypeErrors<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      getTypeErrorsReflect: () => {
        const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
          'a',
          'b',
          'c',
        ];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
          'a',
          'b',
          'c',
        ];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () =>
        createPrepareForJson<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      deserializePrepareForJson: () =>
        deserializePrepareForJson<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      prepareForJsonReflect: () => {
        const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
          'a',
          'b',
          'c',
        ];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
          'a',
          'b',
          'c',
        ];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () =>
        createRestoreFromJson<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      deserializeRestoreFromJson: () =>
        deserializeRestoreFromJson<string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'}>(),
      restoreFromJsonReflect: () => {
        const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
          'a',
          'b',
          'c',
        ];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: string[] | number[] | boolean[] | {a: string; aa: boolean} | {b: number} | {c: bigint; aa: 'string'} = [
          'a',
          'b',
          'c',
        ];
        return deserializeRestoreFromJson(v);
      },
      // Round-trip skipped (phase 7) — this union contains transforming or non-serializable members; the noop union emit cannot reconstruct them. Marks the case for the round-trip adapter without affecting validator coverage.
      getRoundTripValid: () => [],
      getSamples: () => ({
        valid: [
          ['a', 'b', 'c'],
          [1, 2, 3],
          [true, false],
          {a: 'hello', aa: true},
          {b: 123, c: 123n}, // matches {b: number}, extra c allowed
        ],
        invalid: [
          [1, 'b'], // mixed-type array — no array arm matches
          {}, // empty object
          {a: 'hello', d: 'world'}, // missing aa, no other match
          null,
          undefined,
          [null],
          'not in any arm',
        ],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    union_merged_property: {
      title: 'Union of shapes sharing a prop with different value types',
      description:
        "mion union.spec.ts 'validate union with merged properties' — single shared prop with different value types; `a` accepts boolean OR number.",
      isType: () => createIsType<{a: boolean} | {a: number}>(),
      deserializeIsType: () => deserializeIsType<{a: boolean} | {a: number}>(),
      isTypeReflect: () => {
        const v: {a: boolean} | {a: number} = {a: true};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {a: boolean} | {a: number} = {a: true};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{a: boolean} | {a: number}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{a: boolean} | {a: number}>(),
      getTypeErrorsReflect: () => {
        const v: {a: boolean} | {a: number} = {a: true};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {a: boolean} | {a: number} = {a: true};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<{a: boolean} | {a: number}>(),
      deserializePrepareForJson: () => deserializePrepareForJson<{a: boolean} | {a: number}>(),
      prepareForJsonReflect: () => {
        const v: {a: boolean} | {a: number} = {a: true};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: {a: boolean} | {a: number} = {a: true};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<{a: boolean} | {a: number}>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<{a: boolean} | {a: number}>(),
      restoreFromJsonReflect: () => {
        const v: {a: boolean} | {a: number} = {a: true};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: {a: boolean} | {a: number} = {a: true};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{a: true}, {a: false}, {a: 123}, {a: 0}],
        invalid: [{a: 'hello'}, {}, null, undefined, {a: 'string not boolean or number'}, {a: null}, {a: NaN}],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    union_mixed_with_index: {
      title: 'Union mixing arrays, plain objects, and index-signature shapes',
      description:
        "mion union.spec.ts 'Union mixed with index property' — arrays + objects (some with index signatures) in the same union.",
      isType: () =>
        createIsType<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      deserializeIsType: () =>
        deserializeIsType<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      isTypeReflect: () => {
        const v:
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint} = ['a'];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v:
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint} = ['a'];
        return deserializeIsType(v);
      },
      getTypeErrors: () =>
        createGetTypeErrors<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      deserializeGetTypeErrors: () =>
        deserializeGetTypeErrors<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      getTypeErrorsReflect: () => {
        const v:
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint} = ['a'];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v:
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint} = ['a'];
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () =>
        createPrepareForJson<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      deserializePrepareForJson: () =>
        deserializePrepareForJson<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      prepareForJsonReflect: () => {
        const v:
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint} = ['a'];
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v:
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint} = ['a'];
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () =>
        createRestoreFromJson<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      deserializeRestoreFromJson: () =>
        deserializeRestoreFromJson<
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint}
        >(),
      restoreFromJsonReflect: () => {
        const v:
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint} = ['a'];
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v:
          | string[]
          | {a: string; aa: boolean}
          | {b: number}
          | {a: string; [key: string]: string}
          | {[key: string]: bigint; b: bigint} = ['a'];
        return deserializeRestoreFromJson(v);
      },
      // Round-trip skipped (phase 7) — this union contains transforming or non-serializable members; the noop union emit cannot reconstruct them. Marks the case for the round-trip adapter without affecting validator coverage.
      getRoundTripValid: () => [],
      getSamples: () => ({
        valid: [
          ['a', 'b', 'c'],
          {a: 'hello', aa: true},
          {b: 123, a: 'world'}, // matches {b: number}
          {b: 1n, c: 2n}, // matches {[k]: bigint; b: bigint}
          {a: 'hello', aa: true, j: 'extra'},
        ],
        invalid: [[1, 'b'], {}, {a: 'hello', b: 123n}, null, undefined, [null]],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    union_with_any_fallback: {
      title: 'Union with an `any` arm (collapses to any)',
      description:
        "mion union.spec.ts 'support union with any type' — tsgo collapses `T | any` to `any`, so any value passes (the validator is effectively a no-op true).",
      isTypeNotes:
        '`T | any` collapses to `any` at the type-checker layer — the validator becomes a no-op that always returns true. `T | unknown` behaves the same way. If you want a real fallback that still narrows, use a concrete sibling type.',
      isType: () => createIsType<string | any>(),
      deserializeIsType: () => deserializeIsType<string | any>(),
      isTypeReflect: () => {
        const v: string | any = 'hello';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: string | any = 'hello';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<string | any>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<string | any>(),
      getTypeErrorsReflect: () => {
        const v: string | any = 'hello';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: string | any = 'hello';
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<string | any>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string | any>(),
      prepareForJsonReflect: () => {
        const v: string | any = 'hello';
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: string | any = 'hello';
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<string | any>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string | any>(),
      restoreFromJsonReflect: () => {
        const v: string | any = 'hello';
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: string | any = 'hello';
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: ['hello', 123, {foo: 'bar'}, null, undefined, true, []],
        invalid: [],
      }),
      // `T | any` collapses to `any` — no errors are emitted for any input.
      getExpectedErrors: () => [],
    },

    union_with_unknown_fallback: {
      title: 'Union with an `unknown` arm (collapses to unknown)',
      description:
        "mion union.spec.ts 'support union with unknown type' — tsgo collapses `T | unknown` to `unknown`, so any value passes.",
      isType: () => createIsType<string | unknown>(),
      deserializeIsType: () => deserializeIsType<string | unknown>(),
      isTypeReflect: () => {
        const v: string | unknown = 'hello';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: string | unknown = 'hello';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<string | unknown>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<string | unknown>(),
      getTypeErrorsReflect: () => {
        const v: string | unknown = 'hello';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: string | unknown = 'hello';
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<string | unknown>(),
      deserializePrepareForJson: () => deserializePrepareForJson<string | unknown>(),
      prepareForJsonReflect: () => {
        const v: string | unknown = 'hello';
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: string | unknown = 'hello';
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<string | unknown>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<string | unknown>(),
      restoreFromJsonReflect: () => {
        const v: string | unknown = 'hello';
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: string | unknown = 'hello';
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: ['hello', 123, {foo: 'bar'}, null, undefined, true, []],
        invalid: [],
      }),
      getExpectedErrors: () => [],
    },

    union_subset_small_first: {
      title: 'Union with the smaller arm declared before its superset',
      description:
        "mion union.spec.ts 'sortUnreachableTypes' — `{a}` defined before `{a; b}`. Both arms must be reachable: matching SmallObj must not swallow LargeObj-shaped inputs (semantically the same since either arm matching returns true, but pins the regression).",
      isTypeNotes:
        'When one arm is a subset of another (e.g., `{a}` and `{a; b}`), any value satisfying the smaller arm passes — even if extra props would also satisfy the larger arm. Order in the type union does not affect the result.',
      isType: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        return createIsType<SmallObj | LargeObj>();
      },
      deserializeIsType: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        return deserializeIsType<SmallObj | LargeObj>();
      },
      isTypeReflect: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        const v: SmallObj | LargeObj = {a: 'hello'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        const v: SmallObj | LargeObj = {a: 'hello'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        return createGetTypeErrors<SmallObj | LargeObj>();
      },
      deserializeGetTypeErrors: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        return deserializeGetTypeErrors<SmallObj | LargeObj>();
      },
      getTypeErrorsReflect: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        const v: SmallObj | LargeObj = {a: 'hello'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        const v: SmallObj | LargeObj = {a: 'hello'};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        return createPrepareForJson<SmallObj | LargeObj>();
      },
      deserializePrepareForJson: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        return deserializePrepareForJson<SmallObj | LargeObj>();
      },
      prepareForJsonReflect: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        const v: SmallObj | LargeObj = {a: 'hello'};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        const v: SmallObj | LargeObj = {a: 'hello'};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        return createRestoreFromJson<SmallObj | LargeObj>();
      },
      deserializeRestoreFromJson: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        return deserializeRestoreFromJson<SmallObj | LargeObj>();
      },
      restoreFromJsonReflect: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        const v: SmallObj | LargeObj = {a: 'hello'};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        interface SmallObj {
          a: string;
        }
        interface LargeObj {
          a: string;
          b: number;
        }
        const v: SmallObj | LargeObj = {a: 'hello'};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{a: 'hello'}, {a: 'hello', b: 123}],
        // Note: `{a: 'hello', b: <anything>}` passes the SmallObj arm
        // (structural typing — extra props allowed). Only samples that
        // miss BOTH arms' required-prop sets belong here.
        invalid: [{b: 123}, {a: 123}, {}, null, undefined],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    union_subset_nested_levels: {
      title: 'Union with a three-level subset chain',
      description:
        "mion union.spec.ts 'multiple levels of subset relationships' — three arms, each a strict superset of the previous.",
      isType: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        return createIsType<Tiny | Medium | Large>();
      },
      deserializeIsType: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        return deserializeIsType<Tiny | Medium | Large>();
      },
      isTypeReflect: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        const v: Tiny | Medium | Large = {x: 'hello'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        const v: Tiny | Medium | Large = {x: 'hello'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        return createGetTypeErrors<Tiny | Medium | Large>();
      },
      deserializeGetTypeErrors: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        return deserializeGetTypeErrors<Tiny | Medium | Large>();
      },
      getTypeErrorsReflect: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        const v: Tiny | Medium | Large = {x: 'hello'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        const v: Tiny | Medium | Large = {x: 'hello'};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        return createPrepareForJson<Tiny | Medium | Large>();
      },
      deserializePrepareForJson: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        return deserializePrepareForJson<Tiny | Medium | Large>();
      },
      prepareForJsonReflect: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        const v: Tiny | Medium | Large = {x: 'hello'};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        const v: Tiny | Medium | Large = {x: 'hello'};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        return createRestoreFromJson<Tiny | Medium | Large>();
      },
      deserializeRestoreFromJson: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        return deserializeRestoreFromJson<Tiny | Medium | Large>();
      },
      restoreFromJsonReflect: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        const v: Tiny | Medium | Large = {x: 'hello'};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        interface Tiny {
          x: string;
        }
        interface Medium {
          x: string;
          y: number;
        }
        interface Large {
          x: string;
          y: number;
          z: boolean;
        }
        const v: Tiny | Medium | Large = {x: 'hello'};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{x: 'hello'}, {x: 'hello', y: 123}, {x: 'hello', y: 123, z: true}],
        // Note: `{x: 'hello', ...}` passes the Tiny arm regardless of
        // y/z values (structural typing — extra props allowed). Only
        // samples that miss EVERY arm's required-prop set belong here.
        invalid: [{}, {y: 123}, {z: true}, {x: 1}, null, undefined],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    union_subset_mixed_related_unrelated: {
      title: 'Union mixing a subset pair with a disjoint arm',
      description:
        "mion union.spec.ts 'mixed related and unrelated types' — Base and Extended are subset-related, Unrelated is disjoint.",
      isType: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        return createIsType<Base | Extended | Unrelated>();
      },
      deserializeIsType: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        return deserializeIsType<Base | Extended | Unrelated>();
      },
      isTypeReflect: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        const v: Base | Extended | Unrelated = {id: '123'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        const v: Base | Extended | Unrelated = {id: '123'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        return createGetTypeErrors<Base | Extended | Unrelated>();
      },
      deserializeGetTypeErrors: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        return deserializeGetTypeErrors<Base | Extended | Unrelated>();
      },
      getTypeErrorsReflect: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        const v: Base | Extended | Unrelated = {id: '123'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        const v: Base | Extended | Unrelated = {id: '123'};
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        return createPrepareForJson<Base | Extended | Unrelated>();
      },
      deserializePrepareForJson: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        return deserializePrepareForJson<Base | Extended | Unrelated>();
      },
      prepareForJsonReflect: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        const v: Base | Extended | Unrelated = {id: '123'};
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        const v: Base | Extended | Unrelated = {id: '123'};
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        return createRestoreFromJson<Base | Extended | Unrelated>();
      },
      deserializeRestoreFromJson: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        return deserializeRestoreFromJson<Base | Extended | Unrelated>();
      },
      restoreFromJsonReflect: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        const v: Base | Extended | Unrelated = {id: '123'};
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        interface Base {
          id: string;
        }
        interface Extended {
          id: string;
          name: string;
        }
        interface Unrelated {
          value: number;
        }
        const v: Base | Extended | Unrelated = {id: '123'};
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: [{id: '123'}, {id: '123', name: 'test'}, {value: 42}],
        invalid: [{}, {name: 'test'}, {id: 123}, {value: 'not number'}, null, undefined, {value: NaN}],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },
  },
  // TEMPLATE_LITERAL — ports `isType` test coverage from
  // packages/run-types/src/nodes/collection/templateLiteral.spec.ts.
  //
  // Mion's emit compiles the template-literal type into a JS RegExp at
  // build time and calls `regex.test(v)`. Our port needs both
  // serializer-side projection (TypeFlagsTemplateLiteral; extract
  // literal text segments + placeholder kinds) and emit-side regex
  // composition. Today the serializer projects template literal types
  // as `KindUnknown` with the literal text in `typeName`, so neither
  // half exists yet — every case is `it.todo`. Sample payloads carry
  // over verbatim from mion so activation lands without per-case
  // research.
  TEMPLATE_LITERAL: {
    url_with_number_id: {
      title: 'Template literal URL with a number placeholder',
      description:
        "mion templateLiteral.spec.ts 'URL pattern api/user/${number}'. Compiled to `^api\\/user\\/-?(?:\\d+\\.?\\d*|\\.\\d+)$` at JIT-build time; isType emits `typeof v === 'string' && regex.test(v)`.",
      isTypeNotes: [
        'Template literal types are compiled to a JS RegExp at build time and matched at runtime with `regex.test(v)`.',
        'The `${number}` placeholder expects digit-strings (`42`, `-7`, `3.14`) — NOT the words "NaN" or "Infinity" even though those are typeof "number" at the JS level.',
      ],
      isType: () => createIsType<`api/user/${number}`>(),
      deserializeIsType: () => deserializeIsType<`api/user/${number}`>(),
      isTypeReflect: () => {
        const v: `api/user/${number}` = 'api/user/42';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: `api/user/${number}` = 'api/user/42';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<`api/user/${number}`>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<`api/user/${number}`>(),
      getTypeErrorsReflect: () => {
        const v: `api/user/${number}` = 'api/user/42';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: `api/user/${number}` = 'api/user/42';
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: ['api/user/42', 'api/user/0', 'api/user/3.14', 'api/user/-7'],
        invalid: [
          'api/user/abc',
          '/api/user/42',
          'api/user/',
          42,
          null,
          'api/user/42x',
          undefined,
          '',
          'api/user/NaN', // NaN is a name, not a digit-pattern
          'api/user/Infinity', // same
        ],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
      ],
    },

    multi_segment_url: {
      title: 'Template literal URL with multiple placeholders',
      description: "mion templateLiteral.spec.ts 'multi-segment URL'. Multiple placeholders + literal segments.",
      isType: () => createIsType<`/api/v${number}/user/${string}/posts/${number}`>(),
      deserializeIsType: () => deserializeIsType<`/api/v${number}/user/${string}/posts/${number}`>(),
      isTypeReflect: () => {
        const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<`/api/v${number}/user/${string}/posts/${number}`>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<`/api/v${number}/user/${string}/posts/${number}`>(),
      getTypeErrorsReflect: () => {
        const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: `/api/v${number}/user/${string}/posts/${number}` = '/api/v1/user/jane/posts/7';
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: ['/api/v1/user/jane/posts/7', '/api/v2/user/joe/posts/0'],
        invalid: [
          'api/v1/user/jane/posts/7',
          '/api/v1/user/jane/posts/abc',
          '/api/vx/user/jane/posts/7',
          null,
          undefined,
          42,
          '',
        ],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
      ],
    },

    leading_string_placeholder: {
      title: 'Template literal starting with a string placeholder',
      description:
        "mion templateLiteral.spec.ts 'leading ${string} placeholder' — empty-string prefix accepted (string span uses `[\\s\\S]*`, not `+`).",
      isTypeNotes: 'A leading `${string}` placeholder matches the empty string too — `"/42"` is valid (no characters before the slash).',
      isType: () => createIsType<`${string}/${number}`>(),
      deserializeIsType: () => deserializeIsType<`${string}/${number}`>(),
      isTypeReflect: () => {
        const v: `${string}/${number}` = '/42';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: `${string}/${number}` = '/42';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<`${string}/${number}`>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<`${string}/${number}`>(),
      getTypeErrorsReflect: () => {
        const v: `${string}/${number}` = '/42';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: `${string}/${number}` = '/42';
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: ['/42', 'users/42'],
        invalid: ['users', '/abc', null, undefined, '', 42, 'abc/abc'],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
      ],
    },

    regex_special_chars: {
      title: 'Template literal with regex metacharacters in literal segments',
      description:
        "mion templateLiteral.spec.ts 'regex special chars in literal' — parens (and other regex metacharacters) in the literal segments must be escaped in the compiled regex.",
      isType: () => createIsType<`(${number})`>(),
      deserializeIsType: () => deserializeIsType<`(${number})`>(),
      isTypeReflect: () => {
        const v: `(${number})` = '(42)';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: `(${number})` = '(42)';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<`(${number})`>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<`(${number})`>(),
      getTypeErrorsReflect: () => {
        const v: `(${number})` = '(42)';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: `(${number})` = '(42)';
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: ['(42)', '(0)', '(-3.14)'],
        invalid: ['42', '(abc)', '()', '(42', null, undefined, '', '42)', '(NaN)'],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
        [{path: [], expected: 'templateLiteral'}],
      ],
    },

    template_literal_nested_in_object: {
      title: 'Object with a template-literal-typed string property',
      description:
        "mion templateLiteral.spec.ts 'nested in object' — template literal as a property value; the parent object's AND chain composes the typeof+regex check against `v.url`.",
      isType: () => createIsType<{url: `api/user/${number}`; method: string}>(),
      deserializeIsType: () => deserializeIsType<{url: `api/user/${number}`; method: string}>(),
      isTypeReflect: () => {
        const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{url: `api/user/${number}`; method: string}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{url: `api/user/${number}`; method: string}>(),
      getTypeErrorsReflect: () => {
        const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {url: `api/user/${number}`; method: string} = {url: 'api/user/42', method: 'GET'};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [{url: 'api/user/42', method: 'GET'}],
        invalid: [
          {url: 'api/admin/42', method: 'GET'},
          {url: 'api/user/42'},
          null,
          undefined,
          {url: 42, method: 'GET'},
          {method: 'GET'},
          {url: 'api/user/42', method: 42},
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['url'], expected: 'templateLiteral'}],
        [{path: ['method'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['url'], expected: 'templateLiteral'}],
        [{path: ['url'], expected: 'templateLiteral'}],
        [{path: ['method'], expected: 'string'}],
      ],
    },

    template_literal_index_key: {
      title: 'Index signature whose key is a template literal pattern',
      description:
        "mion templateLiteral.spec.ts 'as index signature key' — index signature whose key type is a template literal pattern. The IndexSignature emit now compiles the key pattern to a regex (same path as standalone template literals) and adds a per-key `regex.test(k)` check to the for-in loop, mirroring mion's getKeyPatternVar.",
      isTypeNotes:
        'Index-signature keys constrained by a template literal pattern: every own key on the object must match the compiled regex AND its value must satisfy the value type.',
      isType: () => createIsType<{[key: `api/${string}`]: number}>(),
      deserializeIsType: () => deserializeIsType<{[key: `api/${string}`]: number}>(),
      isTypeReflect: () => {
        const v: {[key: `api/${string}`]: number} = {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: {[key: `api/${string}`]: number} = {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<{[key: `api/${string}`]: number}>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<{[key: `api/${string}`]: number}>(),
      getTypeErrorsReflect: () => {
        const v: {[key: `api/${string}`]: number} = {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: {[key: `api/${string}`]: number} = {};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [{}, {'api/users': 1}, {'api/users': 1, 'api/admin': 2}],
        invalid: [{foo: 1}, {'api/users': 'not number'}, {'api/users': 1, foo: 2}, null, undefined, {'api/users': NaN}],
      }),
      getExpectedErrors: () => [
        // {foo: 1} — key 'foo' fails the template-literal pattern.
        [{path: ['foo'], expected: 'never'}],
        // {'api/users': 'not number'} — key passes, value fails number.
        [{path: ['api/users'], expected: 'number'}],
        // {'api/users': 1, foo: 2} — 'foo' fails key pattern; 'api/users' OK.
        [{path: ['foo'], expected: 'never'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['api/users'], expected: 'number'}],
      ],
    },

    template_literal_union_placeholder: {
      title: 'Template literal with a union-of-literals placeholder',
      description:
        'Template literal with a union placeholder. tsgo distributes the union internally, so the type-checker hands the projector either a union span or a pre-distributed set of template literals; either way the compiled regex must constrain the placeholder to {a, b} — anything outside the union must be rejected.',
      isTypeNotes:
        'Union placeholders inside a template literal compile to a character-class / alternation in the regex — only the listed literal values pass.',
      isType: () => createIsType<`${'a' | 'b'}-${number}`>(),
      deserializeIsType: () => deserializeIsType<`${'a' | 'b'}-${number}`>(),
      isTypeReflect: () => {
        const v: `${'a' | 'b'}-${number}` = 'a-42';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: `${'a' | 'b'}-${number}` = 'a-42';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<`${'a' | 'b'}-${number}`>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<`${'a' | 'b'}-${number}`>(),
      getTypeErrorsReflect: () => {
        const v: `${'a' | 'b'}-${number}` = 'a-42';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: `${'a' | 'b'}-${number}` = 'a-42';
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: ['a-42', 'b-0', 'a--3.14'],
        invalid: ['c-1', 'a-', '-1', 'a-foo', 'ab-1', null, undefined, '', 'A-1', 42],
      }),
      // The resolver distributes ${'a'|'b'} into a union of two template
      // literals (`'a-${number}'` | `'b-${number}'`), so the top-level
      // kind is KindUnion not KindTemplateLiteral. Expected kindname is
      // 'union'.
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },
  },

  // NATIVE — native JS / runtime container types that need bespoke
  // `instanceof` + element-iteration emits:
  //   - `Map<K, V>` → `instanceof Map` + iterate `.entries()`
  //   - `Set<T>`   → `instanceof Set` + iterate `.values()`
  //   - `Promise<T>` → thenable check (the wrapped T isn't validated
  //     synchronously; callers use `Awaited<P>` for the resolved value)
  // Mirrors mion's nodes/native/* runtype implementations. Date and
  // RegExp are also "native" but project as atomic kinds and live in
  // the ATOMIC block above.
  NATIVE: {
    map_string_number: {
      title: 'Map with string keys and number values',
      description:
        'mion native/map — `v instanceof Map` plus iteration over `v.entries()` checking each key and value against K / V.',
      isType: () => createIsType<Map<string, number>>(),
      deserializeIsType: () => deserializeIsType<Map<string, number>>(),
      isTypeReflect: () => {
        const v: Map<string, number> = new Map();
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Map<string, number> = new Map();
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Map<string, number>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Map<string, number>>(),
      getTypeErrorsReflect: () => {
        const v: Map<string, number> = new Map();
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Map<string, number> = new Map();
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<Map<string, number>>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Map<string, number>>(),
      prepareForJsonReflect: () => {
        const v: Map<string, number> = new Map();
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: Map<string, number> = new Map();
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<Map<string, number>>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Map<string, number>>(),
      restoreFromJsonReflect: () => {
        const v: Map<string, number> = new Map();
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: Map<string, number> = new Map();
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => {
        const empty = new Map();
        const one = new Map([['a', 1]]);
        const many = new Map([
          ['a', 1],
          ['b', 2],
        ]);
        const wrongKey = new Map<any, number>([[1, 1]]);
        const wrongValue = new Map<string, any>([['a', 'not number']]);
        const nanValue = new Map<string, any>([['a', NaN]]);
        return {
          valid: [empty, one, many],
          invalid: [{}, [], null, 'not map', wrongKey, wrongValue, undefined, new Date(), nanValue, new Set()],
        };
      },
      getExpectedErrors: () => [
        [{path: [], expected: 'map'}],
        [{path: [], expected: 'map'}],
        [{path: [], expected: 'map'}],
        [{path: [], expected: 'map'}],
        // wrongKey: Map with key=1 (number not string). Path is the
        // mion-style {key, index, failed} segment object identifying
        // which side of which entry failed.
        [{path: [{key: 1, index: 0, failed: 'mapKey'}], expected: 'string'}],
        [{path: [{key: 'a', index: 0, failed: 'mapValue'}], expected: 'number'}],
        [{path: [], expected: 'map'}],
        [{path: [], expected: 'map'}],
        [{path: [{key: 'a', index: 0, failed: 'mapValue'}], expected: 'number'}],
        [{path: [], expected: 'map'}],
      ],
    },

    set_string: {
      title: 'Set of strings',
      description: 'mion native/set — `v instanceof Set` plus iteration over `v.values()`.',
      isType: () => createIsType<Set<string>>(),
      deserializeIsType: () => deserializeIsType<Set<string>>(),
      isTypeReflect: () => {
        const v: Set<string> = new Set();
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Set<string> = new Set();
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Set<string>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Set<string>>(),
      getTypeErrorsReflect: () => {
        const v: Set<string> = new Set();
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Set<string> = new Set();
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<Set<string>>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Set<string>>(),
      prepareForJsonReflect: () => {
        const v: Set<string> = new Set();
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: Set<string> = new Set();
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<Set<string>>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Set<string>>(),
      restoreFromJsonReflect: () => {
        const v: Set<string> = new Set();
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: Set<string> = new Set();
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => {
        const empty = new Set<string>();
        const one = new Set(['a']);
        const many = new Set(['a', 'b', 'c']);
        const wrongType = new Set<any>([1]);
        const nullElement = new Set<any>([null]);
        return {
          valid: [empty, one, many],
          invalid: [{}, [], null, 'not set', wrongType, undefined, new Date(), new Map(), nullElement],
        };
      },
      getExpectedErrors: () => [
        [{path: [], expected: 'set'}],
        [{path: [], expected: 'set'}],
        [{path: [], expected: 'set'}],
        [{path: [], expected: 'set'}],
        // wrongType: Set with item 1 (number not string). Path is
        // the item index 0.
        [{path: [0], expected: 'string'}],
        [{path: [], expected: 'set'}],
        [{path: [], expected: 'set'}],
        [{path: [], expected: 'set'}],
        // nullElement: Set with item null (not string).
        [{path: [0], expected: 'string'}],
      ],
    },

    promise_string: {
      title: 'Promise — thenable check, wrapped type not validated',
      description:
        "Promise validation is a thenable check — `typeof v === 'object' && v !== null && typeof v.then === 'function'`. The wrapped T cannot be validated synchronously (the promise hasn't resolved); callers use `Awaited<P>` for the resolved-value check (see `awaited_promise` below).",
      isTypeNotes: [
        'TS DIVERGENCE: Promise validation is a "thenable" check — any object with a `then: function` PASSES, even if it is not an actual `Promise` instance.',
        'The wrapped type T is NOT validated — the promise has not resolved yet. Use `Awaited<P>` if you have the resolved value and want to validate it.',
      ],
      isType: () => createIsType<Promise<string>>(),
      deserializeIsType: () => deserializeIsType<Promise<string>>(),
      isTypeReflect: () => {
        const v: Promise<string> = Promise.resolve('x');
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Promise<string> = Promise.resolve('x');
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Promise<string>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Promise<string>>(),
      getTypeErrorsReflect: () => {
        const v: Promise<string> = Promise.resolve('x');
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Promise<string> = Promise.resolve('x');
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<Promise<string>>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Promise<string>>(),
      prepareForJsonReflect: () => {
        const v: Promise<string> = Promise.resolve('x');
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: Promise<string> = Promise.resolve('x');
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<Promise<string>>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Promise<string>>(),
      restoreFromJsonReflect: () => {
        const v: Promise<string> = Promise.resolve('x');
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: Promise<string> = Promise.resolve('x');
        return deserializeRestoreFromJson(v);
      },
      // Promise / thenable round-trip is inherently lossy: JSON.stringify
      // produces `{}` for both (no enumerable own props on a Promise;
      // the `then` function gets dropped on a thenable). mion's emit
      // throws for non-serializable types at JIT-compile time; we
      // soft-skip the round-trip samples instead.
      getRoundTripValid: () => [],
      getSamples: () => {
        const realPromise = Promise.resolve('x');
        const thenable = {then: () => null};
        // {then: 'not a function'} — fails the typeof === 'function' check
        const fakeThenable = {then: 'not a function'};
        return {
          valid: [realPromise, thenable],
          invalid: [null, 'string', 42, {}, [], undefined, true, fakeThenable],
        };
      },
      getExpectedErrors: () => [
        [{path: [], expected: 'promise'}],
        [{path: [], expected: 'promise'}],
        [{path: [], expected: 'promise'}],
        [{path: [], expected: 'promise'}],
        [{path: [], expected: 'promise'}],
        [{path: [], expected: 'promise'}],
        [{path: [], expected: 'promise'}],
        [{path: [], expected: 'promise'}],
      ],
    },

    awaited_promise: {
      title: 'Awaited<Promise<T>> — resolves to the wrapped type',
      description:
        "TypeScript's built-in `Awaited<P>` utility unwraps the promise to its resolved type; tsgo resolves it at compile time, so this case lands as plain `string` in our cache and reuses the atomic string emit. The test verifies the utility threads through correctly.",
      isTypeNotes:
        '`Awaited<P>` is resolved at the type-checker layer to the resolved value type — `Awaited<Promise<string>>` becomes plain `string`. The validator is identical to the atomic-string emit; a real Promise does NOT satisfy it.',
      isType: () => createIsType<Awaited<Promise<string>>>(),
      deserializeIsType: () => deserializeIsType<Awaited<Promise<string>>>(),
      isTypeReflect: () => {
        const v: Awaited<Promise<string>> = 'hello';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Awaited<Promise<string>> = 'hello';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Awaited<Promise<string>>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Awaited<Promise<string>>>(),
      getTypeErrorsReflect: () => {
        const v: Awaited<Promise<string>> = 'hello';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Awaited<Promise<string>> = 'hello';
        return deserializeGetTypeErrors(v);
      },
      prepareForJson: () => createPrepareForJson<Awaited<Promise<string>>>(),
      deserializePrepareForJson: () => deserializePrepareForJson<Awaited<Promise<string>>>(),
      prepareForJsonReflect: () => {
        const v: Awaited<Promise<string>> = 'hello';
        return createPrepareForJson(v);
      },
      deserializePrepareForJsonReflect: () => {
        const v: Awaited<Promise<string>> = 'hello';
        return deserializePrepareForJson(v);
      },
      restoreFromJson: () => createRestoreFromJson<Awaited<Promise<string>>>(),
      deserializeRestoreFromJson: () => deserializeRestoreFromJson<Awaited<Promise<string>>>(),
      restoreFromJsonReflect: () => {
        const v: Awaited<Promise<string>> = 'hello';
        return createRestoreFromJson(v);
      },
      deserializeRestoreFromJsonReflect: () => {
        const v: Awaited<Promise<string>> = 'hello';
        return deserializeRestoreFromJson(v);
      },
      getSamples: () => ({
        valid: ['hello', ''],
        invalid: [42, null, undefined, Promise.resolve('x'), true, {}, []],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
      ],
    },
  },

  // CIRCULAR — Self-referential and mutually-recursive type shapes
  // ported 1:1 from mion's
  // packages/run-types/src/nodes/collection/circularRefs.spec.ts.
  //
  // Other sections already carry circular cases that live naturally
  // there:
  //   - ARRAY.circular_array, ARRAY.circular_object_with_array
  //   - OBJECT.circular_interface, OBJECT.circular_interface_on_array,
  //     OBJECT.circular_interface_on_nested_object
  //   - TUPLE.tuple_circular
  //   - UNION.circular_union
  // This section carries the additional circular variants that
  // exercise the dependency-call layer through tuple-typed properties,
  // index signatures, and deeply nested object paths.
  CIRCULAR: {
    object_full_mion_shape: {
      title: 'Self-referential object with optional self-ref and Date prop',
      description:
        "mion circularRefs.spec.ts 'Circular object' — full mion fixture (number + string + self-ref + Date). Exercises the same self-recursive dependency call as OBJECT.circular_interface but pins the exact mion shape.",
      isTypeNotes: 'Self-referential shapes are validated recursively. Atomic rules apply at every level (NaN at `n`, Invalid Date at `d`, etc.).',
      isType: () => {
        interface Circular {
          n: number;
          s: string;
          c?: Circular;
          d?: Date;
        }
        return createIsType<Circular>();
      },
      deserializeIsType: () => {
        interface Circular {
          n: number;
          s: string;
          c?: Circular;
          d?: Date;
        }
        return deserializeIsType<Circular>();
      },
      isTypeReflect: () => {
        interface Circular {
          n: number;
          s: string;
          c?: Circular;
          d?: Date;
        }
        const v: Circular = {n: 1, s: 'hello'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Circular {
          n: number;
          s: string;
          c?: Circular;
          d?: Date;
        }
        const v: Circular = {n: 1, s: 'hello'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Circular {
          n: number;
          s: string;
          c?: Circular;
          d?: Date;
        }
        return createGetTypeErrors<Circular>();
      },
      deserializeGetTypeErrors: () => {
        interface Circular {
          n: number;
          s: string;
          c?: Circular;
          d?: Date;
        }
        return deserializeGetTypeErrors<Circular>();
      },
      getTypeErrorsReflect: () => {
        interface Circular {
          n: number;
          s: string;
          c?: Circular;
          d?: Date;
        }
        const v: Circular = {n: 1, s: 'hello'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Circular {
          n: number;
          s: string;
          c?: Circular;
          d?: Date;
        }
        const v: Circular = {n: 1, s: 'hello'};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {n: 1, s: 'hello', c: {n: 2, s: 'world'}},
          {n: 2, s: 'world'},
          {n: 3, s: 'foo', c: {n: 3, s: 'foo'}},
        ],
        invalid: [
          {n: 1, s: 'hello', c: {n: 2, s: 123}}, // c.s wrong type
          {n: 1, s: 'hello', c: {n: 2}}, // c.s missing
          null,
          undefined,
          {n: NaN, s: 'x'}, // NaN at n
          {n: 1, s: 'x', d: new Date('invalid')}, // Invalid Date in optional d
          {n: 1, s: 'x', d: 'not date'},
          {}, // missing required n and s
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['c', 's'], expected: 'string'}],
        [{path: ['c', 's'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['n'], expected: 'number'}],
        [{path: ['d'], expected: 'date'}],
        [{path: ['d'], expected: 'date'}],
        [
          {path: ['n'], expected: 'number'},
          {path: ['s'], expected: 'string'},
        ],
      ],
    },

    array_of_union_with_self_ref: {
      title: 'Self-referential array whose union element includes the array itself',
      description:
        "mion circularRefs.spec.ts 'Circular array + union' — self-recursive array whose element type is a union including the array itself. Closes the cycle via Array → Union → Array.",
      isType: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createIsType<CuArray>();
      },
      deserializeIsType: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return deserializeIsType<CuArray>();
      },
      isTypeReflect: () => {
        type CuArray = (CuArray | Date | number | string)[];
        const v: CuArray = [];
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type CuArray = (CuArray | Date | number | string)[];
        const v: CuArray = [];
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return createGetTypeErrors<CuArray>();
      },
      deserializeGetTypeErrors: () => {
        type CuArray = (CuArray | Date | number | string)[];
        return deserializeGetTypeErrors<CuArray>();
      },
      getTypeErrorsReflect: () => {
        type CuArray = (CuArray | Date | number | string)[];
        const v: CuArray = [];
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type CuArray = (CuArray | Date | number | string)[];
        const v: CuArray = [];
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => {
        const date = new Date();
        const cu1: any = [date, 123, 'hello', ['a', 'b', 'c']];
        const cu2: any = [date, 123, 'hello', ['a', 2, 'c'], cu1];
        const cu3: any = [];
        return {
          valid: [cu1, cu2, cu3],
          invalid: [
            [date, 123, 'hello', ['a', 2, 'c'], {a: 1, b: 2}], // {} not in union
            ['hello', 123, [{a: 1, b: 2}]],
            {},
            null,
            undefined,
            [true], // boolean not in union
            [new Date('invalid')], // Invalid Date inside
            [NaN], // NaN as number
          ],
        };
      },
      getExpectedErrors: () => [
        // index 4 is {a:1, b:2} which isn't in the union.
        [{path: [4], expected: 'union'}],
        // index 2 is [{a,b}] — the inner array fails the union check
        // (its element doesn't match any arm), so the OUTER union
        // reports one error at index 2 (union emit doesn't recurse —
        // it's a boolean delegation to isType per mion semantic).
        [{path: [2], expected: 'union'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [], expected: 'array'}],
        [{path: [0], expected: 'union'}],
        [{path: [0], expected: 'union'}],
        [{path: [0], expected: 'union'}],
      ],
    },

    object_with_tuple_prop: {
      title: 'Self-referential object whose cycle closes via a tuple property',
      description:
        "mion circularRefs.spec.ts 'Circular object with tuple' — cycle closed via a tuple-typed property. Same mechanism as TUPLE.tuple_circular but the recursion goes through an object → tuple boundary.",
      isType: () => {
        interface CircularTuple {
          tuple: [bigint, CircularTuple?];
        }
        return createIsType<CircularTuple>();
      },
      deserializeIsType: () => {
        interface CircularTuple {
          tuple: [bigint, CircularTuple?];
        }
        return deserializeIsType<CircularTuple>();
      },
      isTypeReflect: () => {
        interface CircularTuple {
          tuple: [bigint, CircularTuple?];
        }
        const v: CircularTuple = {tuple: [1n]};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface CircularTuple {
          tuple: [bigint, CircularTuple?];
        }
        const v: CircularTuple = {tuple: [1n]};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface CircularTuple {
          tuple: [bigint, CircularTuple?];
        }
        return createGetTypeErrors<CircularTuple>();
      },
      deserializeGetTypeErrors: () => {
        interface CircularTuple {
          tuple: [bigint, CircularTuple?];
        }
        return deserializeGetTypeErrors<CircularTuple>();
      },
      getTypeErrorsReflect: () => {
        interface CircularTuple {
          tuple: [bigint, CircularTuple?];
        }
        const v: CircularTuple = {tuple: [1n]};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface CircularTuple {
          tuple: [bigint, CircularTuple?];
        }
        const v: CircularTuple = {tuple: [1n]};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [{tuple: [1n, {tuple: [2n, {tuple: [3n, {tuple: [4n]}]}]}]}, {tuple: [1n, {tuple: [2n]}]}, {tuple: [1n]}],
        invalid: [
          {tuple: [1n, {tuple: 'hello'}]}, // inner `tuple` not an array
          {tuple: [1n, {tuple: []}]}, // empty inner tuple — missing required bigint
          [],
          null,
          undefined,
          {tuple: ['not bigint']},
          {tuple: [1n, 'not object']}, // second slot wrong type
          {}, // missing required tuple prop
        ],
      }),
      getExpectedErrors: () => [
        // {tuple: [1n, {tuple: 'hello'}]} — inner.tuple is not an array.
        [{path: ['tuple', 1, 'tuple'], expected: 'tuple'}],
        // {tuple: [1n, {tuple: []}]} — inner tuple [] has slot 0 missing.
        [{path: ['tuple', 1, 'tuple', 0], expected: 'bigint'}],
        // [] — typeof === 'object' && !== null passes (arrays are objects);
        // descends to check `tuple` prop. v.tuple is undefined → tuple
        // check fails at ['tuple'].
        [{path: ['tuple'], expected: 'tuple'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        // {tuple: ['not bigint']} — slot 0 wrong type.
        [{path: ['tuple', 0], expected: 'bigint'}],
        // {tuple: [1n, 'not object']} — slot 1 is non-undefined but not an object.
        [{path: ['tuple', 1], expected: 'objectLiteral'}],
        // {} — missing required tuple prop → tuple defaults to undefined.
        [{path: ['tuple'], expected: 'tuple'}],
      ],
    },

    object_with_index_prop: {
      title: 'Self-referential object whose cycle closes via an index signature',
      description:
        "mion circularRefs.spec.ts 'Circular Object with index property' — cycle closed via an index-signature value type. Exercises the index-signature for-in loop calling back into the same validator.",
      isType: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createIsType<CircularIndex>();
      },
      deserializeIsType: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return deserializeIsType<CircularIndex>();
      },
      isTypeReflect: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        const v: CircularIndex = {index: {}};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        const v: CircularIndex = {index: {}};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return createGetTypeErrors<CircularIndex>();
      },
      deserializeGetTypeErrors: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        return deserializeGetTypeErrors<CircularIndex>();
      },
      getTypeErrorsReflect: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        const v: CircularIndex = {index: {}};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface CircularIndex {
          index: {[key: string]: CircularIndex};
        }
        const v: CircularIndex = {index: {}};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [{index: {a: {index: {b: {index: {}}}}}}, {index: {a: {index: {}}}}, {index: {}}],
        invalid: [
          {index: {a: 1234}}, // value not an object
          {index: {a: {index: 'hello'}}}, // nested `index` wrong type
          new Date(), // missing `index` property
          null,
          undefined,
          {}, // missing required index prop
          {index: 'not object'},
          {index: {a: null}},
        ],
      }),
      getExpectedErrors: () => [
        // {index: {a: 1234}} — index['a'] is not a CircularIndex object.
        [{path: ['index', 'a'], expected: 'objectLiteral'}],
        // {index: {a: {index: 'hello'}}} — nested .index is not an object.
        [{path: ['index', 'a', 'index'], expected: 'objectLiteral'}],
        // new Date() — Date doesn't have an `index` prop matching the shape.
        // It IS a plain `typeof === 'object' && !== null` — but
        // missing `index` prop → typeErrors at ['index'].
        [{path: ['index'], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['index'], expected: 'objectLiteral'}],
        [{path: ['index'], expected: 'objectLiteral'}],
        [{path: ['index', 'a'], expected: 'objectLiteral'}],
      ],
    },

    object_deeply_nested: {
      title: 'Self-referential object with the cycle buried four levels deep',
      description:
        "mion circularRefs.spec.ts 'Circular Object with deep nested properties' — cycle closed via four levels of nested object properties. Stresses the dependency-call layer when the self-ref is buried deep in an anonymous-shape chain.",
      isType: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createIsType<CircularDeep>();
      },
      deserializeIsType: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return deserializeIsType<CircularDeep>();
      },
      isTypeReflect: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return createGetTypeErrors<CircularDeep>();
      },
      deserializeGetTypeErrors: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        return deserializeGetTypeErrors<CircularDeep>();
      },
      getTypeErrorsReflect: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface CircularDeep {
          deep1: {deep2: {deep3: {deep4?: CircularDeep}}};
        }
        const v: CircularDeep = {deep1: {deep2: {deep3: {}}}};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [{deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: {}}}}}}}}, {deep1: {deep2: {deep3: {}}}}],
        invalid: [
          {deep1: {deep2: {deep3: {deep4: {deep1: {deep2: {deep3: 1234}}}}}}},
          {deep1: {}},
          {deep1: {deep2: {deep3: 12435}}},
          {deep1: {deep2: {deep3: {deep4: 'hello'}}}},
          'hello',
          null,
          undefined,
          {}, // missing deep1
          {deep1: null},
          {deep1: {deep2: null}},
        ],
      }),
      getExpectedErrors: () => [
        // deep4.deep1.deep2.deep3 = 1234 → not an object.
        [{path: ['deep1', 'deep2', 'deep3', 'deep4', 'deep1', 'deep2', 'deep3'], expected: 'objectLiteral'}],
        // {deep1: {}} — deep1 missing deep2.
        [{path: ['deep1', 'deep2'], expected: 'objectLiteral'}],
        // deep1.deep2.deep3 = 12435.
        [{path: ['deep1', 'deep2', 'deep3'], expected: 'objectLiteral'}],
        // deep1.deep2.deep3.deep4 = 'hello' — optional but non-undefined → recurse → not object.
        [{path: ['deep1', 'deep2', 'deep3', 'deep4'], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        // {} — missing deep1.
        [{path: ['deep1'], expected: 'objectLiteral'}],
        // {deep1: null} — deep1 is null, fails object check.
        [{path: ['deep1'], expected: 'objectLiteral'}],
        // {deep1: {deep2: null}} — deep2 is null.
        [{path: ['deep1', 'deep2'], expected: 'objectLiteral'}],
      ],
    },

    circular_child_under_literal_root: {
      title: 'Non-circular root holding a circular child interface',
      description:
        "mion interface.spec.ts 'Interface with nested circular type where root is not the circular ref' — RootNotCircular is a flat shape (literal discriminator + one prop) whose ciChild property is a self-referential ICircularDeep. Pins the case where the dependency-call layer kicks in BELOW the root rather than at the root itself.",
      isType: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createIsType<RootNotCircular>();
      },
      deserializeIsType: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return deserializeIsType<RootNotCircular>();
      },
      isTypeReflect: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        const v: RootNotCircular = {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        };
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        const v: RootNotCircular = {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        };
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return createGetTypeErrors<RootNotCircular>();
      },
      deserializeGetTypeErrors: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        return deserializeGetTypeErrors<RootNotCircular>();
      },
      getTypeErrorsReflect: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        const v: RootNotCircular = {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        };
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface RootNotCircular {
          isRoot: true;
          ciChild: ICircularDeep;
        }
        const v: RootNotCircular = {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
        };
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}}},
          {
            isRoot: true,
            ciChild: {
              name: 'hello',
              big: 1n,
              embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
            },
          },
        ],
        invalid: [
          {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}}, // embedded.hello wrong type
          {
            isRoot: true,
            ciChild: {
              name: 'hello',
              big: 1n,
              embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
            },
          }, // deep embedded.hello wrong type
          {
            isRoot: false, // not the literal true
            ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world', child: 123}},
          },
          {isRoot: true, ciChild: {name: 'hello', big: 1n}}, // missing embedded
          {isRoot: true}, // missing ciChild
          null,
          undefined,
          {},
        ],
      }),
      getExpectedErrors: () => [
        // ciChild.embedded.hello wrong type (123 not string).
        [{path: ['ciChild', 'embedded', 'hello'], expected: 'string'}],
        // ciChild.embedded.child.embedded.hello wrong type.
        [{path: ['ciChild', 'embedded', 'child', 'embedded', 'hello'], expected: 'string'}],
        // isRoot=false fails literal; child=123 is not an object (recurses
        // through optional, fails object check at the next ICircularDeep).
        [
          {path: ['isRoot'], expected: 'literal'},
          {path: ['ciChild', 'embedded', 'child'], expected: 'objectLiteral'},
        ],
        // ciChild missing `embedded` → fails object check at ['ciChild', 'embedded'].
        [{path: ['ciChild', 'embedded'], expected: 'objectLiteral'}],
        // {isRoot: true} — missing ciChild.
        [{path: ['ciChild'], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        // {} — both required props missing.
        [
          {path: ['isRoot'], expected: 'literal'},
          {path: ['ciChild'], expected: 'objectLiteral'},
        ],
      ],
    },

    multiple_circular_types_cross_referenced: {
      title: 'Multiple circular types cross-referenced from a non-circular root',
      description:
        "mion interface.spec.ts 'Interface with nested circular + multiple circular' — RootCircular carries an optional self-ref AND two distinct circular siblings (ICircularDeep, ICircularDate), and ICircularDate also references ICircularDeep. Stresses the resolver / dependency-call layer when more than one recursive type is in flight at once and the cycles cross.",
      isType: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        return createIsType<RootCircular>();
      },
      deserializeIsType: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        return deserializeIsType<RootCircular>();
      },
      isTypeReflect: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        const v: RootCircular = {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021},
        };
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        const v: RootCircular = {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021},
        };
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        return createGetTypeErrors<RootCircular>();
      },
      deserializeGetTypeErrors: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        return deserializeGetTypeErrors<RootCircular>();
      },
      getTypeErrorsReflect: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        const v: RootCircular = {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021},
        };
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface ICircularDeep {
          name: string;
          big: bigint;
          embedded: {hello: string; child?: ICircularDeep};
        }
        interface ICircularDate {
          date: Date;
          month: number;
          year: number;
          embedded?: ICircularDate;
          deep?: ICircularDeep;
        }
        interface RootCircular {
          isRoot: true;
          ciChild: ICircularDeep;
          ciRoort?: RootCircular;
          ciDate: ICircularDate;
        }
        const v: RootCircular = {
          isRoot: true,
          ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
          ciDate: {date: new Date(), month: 1, year: 2021},
        };
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {
            isRoot: true,
            ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
            ciDate: {date: new Date(), month: 1, year: 2021},
          },
          {
            isRoot: true,
            ciChild: {
              name: 'hello',
              big: 1n,
              embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 'world2'}}},
            },
            ciDate: {date: new Date(), month: 1, year: 2021},
          },
          {
            isRoot: true,
            ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
            ciDate: {
              date: new Date(),
              month: 1,
              year: 2021,
              embedded: {date: new Date(), month: 1, year: 2021},
            },
          },
          {
            isRoot: true,
            ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
            ciRoort: {
              isRoot: true,
              ciChild: {name: 'inner', big: 2n, embedded: {hello: 'world'}},
              ciDate: {date: new Date(), month: 6, year: 2022},
            },
            ciDate: {date: new Date(), month: 1, year: 2021},
          },
        ],
        invalid: [
          {isRoot: true, ciChild: {name: 'hello', big: 1n, embedded: {hello: 123}}}, // missing ciDate, embedded.hello wrong type
          {
            isRoot: true,
            ciChild: {
              name: 'hello',
              big: 1n,
              embedded: {hello: 'world', child: {name: 'world1', big: 1n, embedded: {hello: 123}}},
            },
            ciDate: {date: new Date(), month: 1, year: 2021},
          }, // deep embedded.hello wrong type
          {
            isRoot: false, // not the literal true
            ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
            ciDate: {date: new Date(), month: 1, year: 2021},
          },
          {
            isRoot: true,
            ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
            ciDate: {date: 'not date', month: 1, year: 2021}, // ciDate.date wrong type
          },
          {
            isRoot: true,
            ciChild: {name: 'hello', big: 1n, embedded: {hello: 'world'}},
            ciDate: {date: new Date(), month: 1, year: 2021, embedded: true}, // ciDate.embedded wrong type
          },
          null,
          undefined,
          {},
        ],
      }),
      getExpectedErrors: () => [
        // missing ciDate + ciChild.embedded.hello wrong type → 2 errors.
        [
          {path: ['ciChild', 'embedded', 'hello'], expected: 'string'},
          {path: ['ciDate'], expected: 'objectLiteral'},
        ],
        // deep embedded.hello wrong type.
        [{path: ['ciChild', 'embedded', 'child', 'embedded', 'hello'], expected: 'string'}],
        // isRoot=false fails literal.
        [{path: ['isRoot'], expected: 'literal'}],
        // ciDate.date wrong type.
        [{path: ['ciDate', 'date'], expected: 'date'}],
        // ciDate.embedded is true (boolean), optional but non-undefined →
        // recurses into ICircularDate check, which fails the object guard.
        [{path: ['ciDate', 'embedded'], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        // {} — all 3 required props missing.
        [
          {path: ['isRoot'], expected: 'literal'},
          {path: ['ciChild'], expected: 'objectLiteral'},
          {path: ['ciDate'], expected: 'objectLiteral'},
        ],
      ],
    },
  },

  // UTILITY — TypeScript's built-in utility types (Partial, Required,
  // Pick, Omit, Exclude, Extract, NonNullable, ReturnType, Readonly,
  // Uppercase / Lowercase / Capitalize / Uncapitalize, and combined
  // intersection-with-modifier forms). Mirrors mion's
  // packages/run-types/src/nodes/utility/*.spec.ts.
  //
  // **None of these need new emit code.** tsgo eagerly resolves each
  // utility at the type-checker layer to its concrete shape (Partial
  // becomes an object literal with all-optional props, Pick becomes
  // an object literal with a subset, etc.), so our existing object /
  // union / tuple / string emits handle the resolved forms. These
  // tests are regression coverage that the utilities thread through
  // the cache + emit pipeline without surprises.
  UTILITY: {
    partial: {
      title: 'Partial<T> — all props become optional',
      description:
        'mion utility/partial.spec.ts — all properties become optional. Resolves to {name?: string; age?: number; createdAt?: Date}; reuses the object emit with allOptionalCode array-rejection guard.',
      isTypeNotes:
        'Resolves to an all-optional object shape, so the `allOptionalCode` guard kicks in: arrays, Date, Map, Set, RegExp are rejected at the top level even though `{}` is valid. Present properties still run their atomic checks (Invalid Date in `createdAt` fails).',
      isType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createIsType<Partial<Person>>();
      },
      deserializeIsType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return deserializeIsType<Partial<Person>>();
      },
      isTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Partial<Person> = {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Partial<Person> = {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createGetTypeErrors<Partial<Person>>();
      },
      deserializeGetTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return deserializeGetTypeErrors<Partial<Person>>();
      },
      getTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Partial<Person> = {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Partial<Person> = {};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [{}, {name: 'John'}, {createdAt: new Date()}, {name: 'John', age: 30, createdAt: new Date()}],
        invalid: [
          [], // allOptionalCode rejects arrays
          new Date(), // allOptionalCode rejects native objects
          {name: 42}, // wrong type when prop is present
          {createdAt: 'not date'},
          null,
          undefined,
          {createdAt: new Date('invalid')}, // Invalid Date in optional prop
          new Map(),
          new Set(),
          {age: NaN}, // NaN at optional number
        ],
      }),
      // allOptionalCode guards the outer check, so non-plain-object
      // inputs (arrays, Date, Map, Set) report 'objectLiteral'.
      // Plain objects with bad prop types pass the outer guard and
      // fall through to per-property error accumulation.
      getExpectedErrors: () => [
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['name'], expected: 'string'}],
        [{path: ['createdAt'], expected: 'date'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['createdAt'], expected: 'date'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['age'], expected: 'number'}],
      ],
    },

    required: {
      title: 'Required<T> — all optional props become required',
      description:
        'mion utility/required.spec.ts — all properties become required. Resolves to a plain object literal; reuses the object emit.',
      isType: () => {
        interface MaybePerson {
          name?: string;
          age?: number;
          createdAt?: Date;
        }
        return createIsType<Required<MaybePerson>>();
      },
      deserializeIsType: () => {
        interface MaybePerson {
          name?: string;
          age?: number;
          createdAt?: Date;
        }
        return deserializeIsType<Required<MaybePerson>>();
      },
      isTypeReflect: () => {
        interface MaybePerson {
          name?: string;
          age?: number;
          createdAt?: Date;
        }
        const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface MaybePerson {
          name?: string;
          age?: number;
          createdAt?: Date;
        }
        const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface MaybePerson {
          name?: string;
          age?: number;
          createdAt?: Date;
        }
        return createGetTypeErrors<Required<MaybePerson>>();
      },
      deserializeGetTypeErrors: () => {
        interface MaybePerson {
          name?: string;
          age?: number;
          createdAt?: Date;
        }
        return deserializeGetTypeErrors<Required<MaybePerson>>();
      },
      getTypeErrorsReflect: () => {
        interface MaybePerson {
          name?: string;
          age?: number;
          createdAt?: Date;
        }
        const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface MaybePerson {
          name?: string;
          age?: number;
          createdAt?: Date;
        }
        const v: Required<MaybePerson> = {name: 'John', age: 30, createdAt: new Date()};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [{name: 'John', age: 30, createdAt: new Date()}],
        invalid: [
          {},
          {name: 'John'}, // missing age + createdAt
          {name: 'John', age: 30}, // missing createdAt
          {name: 'John', age: 30, createdAt: 'not date'}, // wrong type
          null,
          undefined,
          {name: 'John', age: NaN, createdAt: new Date()}, // NaN at age
          {name: 'John', age: 30, createdAt: new Date('invalid')}, // Invalid Date
        ],
      }),
      getExpectedErrors: () => [
        // {} — every required prop missing.
        [
          {path: ['name'], expected: 'string'},
          {path: ['age'], expected: 'number'},
          {path: ['createdAt'], expected: 'date'},
        ],
        [
          {path: ['age'], expected: 'number'},
          {path: ['createdAt'], expected: 'date'},
        ],
        [{path: ['createdAt'], expected: 'date'}],
        [{path: ['createdAt'], expected: 'date'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['age'], expected: 'number'}],
        [{path: ['createdAt'], expected: 'date'}],
      ],
    },

    pick: {
      title: 'Pick<T, K> — keeps only the named properties',
      description: 'mion utility/pick.spec.ts — selects a subset of properties. Resolves to {name: string; createdAt: Date}.',
      isTypeNotes: 'Resolves to a fixed-property object with only the picked keys. Extra properties on the input still pass (structural typing).',
      isType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createIsType<Pick<Person, 'name' | 'createdAt'>>();
      },
      deserializeIsType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return deserializeIsType<Pick<Person, 'name' | 'createdAt'>>();
      },
      isTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createGetTypeErrors<Pick<Person, 'name' | 'createdAt'>>();
      },
      deserializeGetTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return deserializeGetTypeErrors<Pick<Person, 'name' | 'createdAt'>>();
      },
      getTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Pick<Person, 'name' | 'createdAt'> = {name: 'John', createdAt: new Date()};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {name: 'John', createdAt: new Date()},
          // Extra props pass (Pick doesn't imply strict)
          {name: 'John', age: 30, createdAt: new Date()},
        ],
        invalid: [
          {name: 'John'}, // missing createdAt
          {createdAt: new Date()}, // missing name
          {name: 42, createdAt: new Date()},
          null,
          undefined,
          {name: 'John', createdAt: new Date('invalid')},
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['createdAt'], expected: 'date'}],
        [{path: ['name'], expected: 'string'}],
        [{path: ['name'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['createdAt'], expected: 'date'}],
      ],
    },

    omit: {
      title: 'Omit<T, K> — drops the named properties',
      description: 'mion utility/omit.spec.ts — removes selected properties. Resolves to {name: string; createdAt: Date}.',
      isTypeNotes: 'Resolves to the original shape minus the omitted keys. The omitted property can still appear on the input — structural typing accepts extras.',
      isType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createIsType<Omit<Person, 'age'>>();
      },
      deserializeIsType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return deserializeIsType<Omit<Person, 'age'>>();
      },
      isTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createGetTypeErrors<Omit<Person, 'age'>>();
      },
      deserializeGetTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return deserializeGetTypeErrors<Omit<Person, 'age'>>();
      },
      getTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Omit<Person, 'age'> = {name: 'John', createdAt: new Date()};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {name: 'John', createdAt: new Date()},
          {name: 'John', age: 30, createdAt: new Date()}, // extra prop still passes
        ],
        invalid: [
          {name: 'John'},
          {createdAt: new Date()},
          null,
          undefined,
          {name: 'John', createdAt: new Date('invalid')},
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['createdAt'], expected: 'date'}],
        [{path: ['name'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['createdAt'], expected: 'date'}],
      ],
    },

    exclude_atomic: {
      title: 'Exclude<U, X> on a string-literal union',
      description: 'mion utility/exclude.spec.ts (atomic case) — excludes union members. Resolves to "name" | "createdAt".',
      isType: () => createIsType<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
      deserializeIsType: () => deserializeIsType<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
      isTypeReflect: () => {
        const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Exclude<'name' | 'age' | 'createdAt', 'age'>>(),
      getTypeErrorsReflect: () => {
        const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Exclude<'name' | 'age' | 'createdAt', 'age'> = 'name';
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: ['name', 'createdAt'],
        invalid: ['age', 'other', 42, null, undefined, true, '', 'Name'],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    extract_atomic: {
      title: 'Extract<U, X> on a string-literal union',
      description:
        'mion utility/extract.spec.ts (atomic case) — extracts matching union members. Resolves to "name" | "createdAt".',
      isType: () => createIsType<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      deserializeIsType: () => deserializeIsType<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      isTypeReflect: () => {
        const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'>>(),
      getTypeErrorsReflect: () => {
        const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Extract<'name' | 'age' | 'createdAt', 'name' | 'createdAt'> = 'name';
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: ['name', 'createdAt'],
        invalid: ['age', 'other', null, undefined, true, 42, '', 'Name'],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    exclude_from_object_union: {
      title: 'Exclude<U, X> on a discriminated object union',
      description: 'mion utility/exclude.spec.ts (object union) — excludes object members from a discriminated union.',
      isType: () => {
        type Shape =
          | {kind: 'circle'; radius: number}
          | {kind: 'square'; x: number}
          | {kind: 'triangle'; base: number; height: number};
        return createIsType<Exclude<Shape, {kind: 'circle'}>>();
      },
      deserializeIsType: () => {
        type Shape =
          | {kind: 'circle'; radius: number}
          | {kind: 'square'; x: number}
          | {kind: 'triangle'; base: number; height: number};
        return deserializeIsType<Exclude<Shape, {kind: 'circle'}>>();
      },
      isTypeReflect: () => {
        type Shape =
          | {kind: 'circle'; radius: number}
          | {kind: 'square'; x: number}
          | {kind: 'triangle'; base: number; height: number};
        const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type Shape =
          | {kind: 'circle'; radius: number}
          | {kind: 'square'; x: number}
          | {kind: 'triangle'; base: number; height: number};
        const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type Shape =
          | {kind: 'circle'; radius: number}
          | {kind: 'square'; x: number}
          | {kind: 'triangle'; base: number; height: number};
        return createGetTypeErrors<Exclude<Shape, {kind: 'circle'}>>();
      },
      deserializeGetTypeErrors: () => {
        type Shape =
          | {kind: 'circle'; radius: number}
          | {kind: 'square'; x: number}
          | {kind: 'triangle'; base: number; height: number};
        return deserializeGetTypeErrors<Exclude<Shape, {kind: 'circle'}>>();
      },
      getTypeErrorsReflect: () => {
        type Shape =
          | {kind: 'circle'; radius: number}
          | {kind: 'square'; x: number}
          | {kind: 'triangle'; base: number; height: number};
        const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type Shape =
          | {kind: 'circle'; radius: number}
          | {kind: 'square'; x: number}
          | {kind: 'triangle'; base: number; height: number};
        const v: Exclude<Shape, {kind: 'circle'}> = {kind: 'square', x: 5};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {kind: 'square', x: 5},
          {kind: 'triangle', base: 4, height: 3},
        ],
        invalid: [
          {kind: 'circle', radius: 3},
          {},
          null,
          undefined,
          {kind: 'square'}, // missing x
          {kind: 'square', x: NaN}, // NaN at x
          {kind: 'triangle', base: 4}, // missing height
        ],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    non_nullable: {
      title: 'NonNullable<T> — strips null and undefined from a union',
      description: 'mion utility/nonNullable.spec.ts — removes null + undefined from a union.',
      isType: () => createIsType<NonNullable<string | number | null | undefined>>(),
      deserializeIsType: () => deserializeIsType<NonNullable<string | number | null | undefined>>(),
      isTypeReflect: () => {
        const v: NonNullable<string | number | null | undefined> = 'hello';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: NonNullable<string | number | null | undefined> = 'hello';
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<NonNullable<string | number | null | undefined>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<NonNullable<string | number | null | undefined>>(),
      getTypeErrorsReflect: () => {
        const v: NonNullable<string | number | null | undefined> = 'hello';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: NonNullable<string | number | null | undefined> = 'hello';
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: ['hello', 42, 0],
        invalid: [null, undefined, true, {}, [], NaN, Infinity],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    return_type: {
      title: 'ReturnType<F> — extracts the return type of a function',
      description: "mion utility/params-return.spec.ts — extracts a function's return type. Resolves to Date.",
      isType: () => {
        type Fn = (a: number, b: boolean) => Date;
        return createIsType<ReturnType<Fn>>();
      },
      deserializeIsType: () => {
        type Fn = (a: number, b: boolean) => Date;
        return deserializeIsType<ReturnType<Fn>>();
      },
      isTypeReflect: () => {
        type Fn = (a: number, b: boolean) => Date;
        const v: ReturnType<Fn> = new Date();
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type Fn = (a: number, b: boolean) => Date;
        const v: ReturnType<Fn> = new Date();
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type Fn = (a: number, b: boolean) => Date;
        return createGetTypeErrors<ReturnType<Fn>>();
      },
      deserializeGetTypeErrors: () => {
        type Fn = (a: number, b: boolean) => Date;
        return deserializeGetTypeErrors<ReturnType<Fn>>();
      },
      getTypeErrorsReflect: () => {
        type Fn = (a: number, b: boolean) => Date;
        const v: ReturnType<Fn> = new Date();
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type Fn = (a: number, b: boolean) => Date;
        const v: ReturnType<Fn> = new Date();
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [new Date()],
        invalid: ['not date', 42, null, undefined, new Date('invalid'), new Date(NaN), {}, []],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'date'}],
        [{path: [], expected: 'date'}],
        [{path: [], expected: 'date'}],
        [{path: [], expected: 'date'}],
        [{path: [], expected: 'date'}],
        [{path: [], expected: 'date'}],
        [{path: [], expected: 'date'}],
        [{path: [], expected: 'date'}],
      ],
    },

    readonly: {
      title: 'Readonly<T> — readonly bit erased at runtime',
      description:
        'Readonly<T> marks properties readonly at the TS layer; the readonly bit is erased at runtime so the validator behaves identically to the source object. Regression check.',
      isType: () => {
        interface Person {
          name: string;
          age: number;
        }
        return createIsType<Readonly<Person>>();
      },
      deserializeIsType: () => {
        interface Person {
          name: string;
          age: number;
        }
        return deserializeIsType<Readonly<Person>>();
      },
      isTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
        }
        const v: Readonly<Person> = {name: 'John', age: 30};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
        }
        const v: Readonly<Person> = {name: 'John', age: 30};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
        }
        return createGetTypeErrors<Readonly<Person>>();
      },
      deserializeGetTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
        }
        return deserializeGetTypeErrors<Readonly<Person>>();
      },
      getTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
        }
        const v: Readonly<Person> = {name: 'John', age: 30};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
        }
        const v: Readonly<Person> = {name: 'John', age: 30};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {name: 'John', age: 30},
          {name: '', age: 0},
        ],
        invalid: [{name: 'John'}, {age: 30}, null, undefined, {name: 1, age: 30}, {name: 'John', age: NaN}],
      }),
      getExpectedErrors: () => [
        [{path: ['age'], expected: 'number'}],
        [{path: ['name'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['name'], expected: 'string'}],
        [{path: ['age'], expected: 'number'}],
      ],
    },

    // String-mapping utilities (Uppercase / Lowercase / Capitalize /
    // Uncapitalize) are intentionally not covered here. They work as
    // pure type-system literal mappings (`Uppercase<'foo'>` resolves
    // to `'FOO'` and validates via the existing literal-equality
    // check) but the CONSTRAINT form — "is this any uppercase
    // string" — is a value-shape predicate, not a type check, and
    // lives in the future validation-constraints library alongside
    // the number brand types (int / uint8 / Range<a, b> / etc.).
    // Mion's own utility/string.spec.ts is `.skip()`'d for the
    // same reason.

    intersection_with_required_override: {
      title: 'Partial<T> intersected with Required<Pick<T, K>> (re-requires one prop)',
      description:
        'Intersection that flips a property\'s optionality — `Partial<Person>` makes all props optional, then `& Required<Pick<Person, "name">>` re-requires only `name`. tsgo resolves the intersection to {name: string; age?: number; createdAt?: Date}; reuses the object emit.',
      isTypeNotes:
        'Intersections of utility types resolve at the type-checker layer to a single flat object shape. Use this pattern to flip a specific property\'s optionality without re-declaring the whole type.',
      isType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createIsType<Partial<Person> & Required<Pick<Person, 'name'>>>();
      },
      deserializeIsType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return deserializeIsType<Partial<Person> & Required<Pick<Person, 'name'>>>();
      },
      isTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createGetTypeErrors<Partial<Person> & Required<Pick<Person, 'name'>>>();
      },
      deserializeGetTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return deserializeGetTypeErrors<Partial<Person> & Required<Pick<Person, 'name'>>>();
      },
      getTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: Partial<Person> & Required<Pick<Person, 'name'>> = {name: 'John'};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {name: 'John'},
          {name: 'John', age: 30},
          {name: 'John', createdAt: new Date()},
          {name: 'John', age: 30, createdAt: new Date()},
        ],
        invalid: [
          {}, // name is required
          {age: 30}, // name still required
          {name: 42}, // wrong type
          {name: 'John', age: '30'}, // wrong type at optional slot
          null,
          undefined,
          {name: 'John', age: NaN}, // NaN at optional
          {name: 'John', createdAt: new Date('invalid')}, // Invalid Date in optional
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['name'], expected: 'string'}],
        [{path: ['name'], expected: 'string'}],
        [{path: ['name'], expected: 'string'}],
        [{path: ['age'], expected: 'number'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['age'], expected: 'number'}],
        [{path: ['createdAt'], expected: 'date'}],
      ],
    },

    omit_keeping_optional: {
      title: 'Omit<T, K> preserves optionality of remaining props',
      description: 'Omit preserves the optionality of remaining properties — resolves to {b?: number; c: boolean}.',
      isType: () => createIsType<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
      deserializeIsType: () => deserializeIsType<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
      isTypeReflect: () => {
        const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
        return deserializeIsType(v);
      },
      getTypeErrors: () => createGetTypeErrors<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
      deserializeGetTypeErrors: () => deserializeGetTypeErrors<Omit<{a: string; b?: number; c: boolean}, 'a'>>(),
      getTypeErrorsReflect: () => {
        const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        const v: Omit<{a: string; b?: number; c: boolean}, 'a'> = {c: true};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [{c: true}, {b: 1, c: false}, {c: true, b: undefined}],
        invalid: [{}, {b: 1}, {c: 'not boolean'}, null, undefined, {c: true, b: NaN}, {c: 0}, {b: 1, c: 1}],
      }),
      // `c` is required, `b` is optional. `c` defaults to undefined when
      // missing → boolean check fails. NaN/non-boolean values at `b` or
      // `c` fall through to their atomic checks.
      getExpectedErrors: () => [
        [{path: ['c'], expected: 'boolean'}],
        [{path: ['c'], expected: 'boolean'}],
        [{path: ['c'], expected: 'boolean'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['b'], expected: 'number'}],
        [{path: ['c'], expected: 'boolean'}],
        [{path: ['c'], expected: 'boolean'}],
      ],
    },

    keyof_to_literal_union: {
      title: 'keyof T — resolves to a union of string-literal keys',
      description:
        '`keyof Person` where Person has `name: string; age: number; createdAt: Date` resolves to the union `"name" | "age" | "createdAt"`. The validator is the union of three string literals.',
      isTypeNotes:
        '`keyof T` is resolved at the type-checker layer to a union of the prop names as literals. Validation is identical to a hand-written string literal union.',
      isType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createIsType<keyof Person>();
      },
      deserializeIsType: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return deserializeIsType<keyof Person>();
      },
      isTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: keyof Person = 'name';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: keyof Person = 'name';
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return createGetTypeErrors<keyof Person>();
      },
      deserializeGetTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        return deserializeGetTypeErrors<keyof Person>();
      },
      getTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: keyof Person = 'name';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
          createdAt: Date;
        }
        const v: keyof Person = 'name';
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: ['name', 'age', 'createdAt'],
        invalid: ['other', '', 42, null, undefined, true, 'Name'],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    typeof_variable_query: {
      title: 'typeof variable — type query on a runtime value',
      description:
        '`typeof config` where `config` is a bound value resolves to the value\'s static type. Without `as const` the type is widened (`url: string`, `port: number`); with `as const` it pins to literals. This case verifies the widened path.',
      isTypeNotes:
        '`typeof <variable>` reads the declared / inferred type of a value. Validation runs against the resolved shape; the value itself is discarded at type-check time.',
      isType: () => {
        const config = {url: 'http://example.com', port: 8080};
        return createIsType<typeof config>();
      },
      deserializeIsType: () => {
        const config = {url: 'http://example.com', port: 8080};
        return deserializeIsType<typeof config>();
      },
      isTypeReflect: () => {
        const config = {url: 'http://example.com', port: 8080};
        return createIsType(config);
      },
      deserializeIsTypeReflect: () => {
        const config = {url: 'http://example.com', port: 8080};
        return deserializeIsType(config);
      },
      getTypeErrors: () => {
        const config = {url: 'http://example.com', port: 8080};
        return createGetTypeErrors<typeof config>();
      },
      deserializeGetTypeErrors: () => {
        const config = {url: 'http://example.com', port: 8080};
        return deserializeGetTypeErrors<typeof config>();
      },
      getTypeErrorsReflect: () => {
        const config = {url: 'http://example.com', port: 8080};
        return createGetTypeErrors(config);
      },
      deserializeGetTypeErrorsReflect: () => {
        const config = {url: 'http://example.com', port: 8080};
        return deserializeGetTypeErrors(config);
      },
      getSamples: () => ({
        valid: [
          {url: 'http://example.com', port: 8080},
          {url: '', port: 0},
        ],
        invalid: [
          {url: 'x'}, // missing port
          {port: 80}, // missing url
          {url: 42, port: 8080}, // wrong type
          null,
          undefined,
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['port'], expected: 'number'}],
        [{path: ['url'], expected: 'string'}],
        [{path: ['url'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    indexed_access_type: {
      title: 'Indexed access type — Person["name"] resolves to string',
      description:
        '`T[K]` reads the value type of a property. `Person["name"]` resolves to `string` at the type-checker layer; the validator is identical to the atomic `string` shape. Pins the resolution path through the cache.',
      isType: () => {
        interface Person {
          name: string;
          age: number;
        }
        return createIsType<Person['name']>();
      },
      deserializeIsType: () => {
        interface Person {
          name: string;
          age: number;
        }
        return deserializeIsType<Person['name']>();
      },
      isTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
        }
        const v: Person['name'] = 'x';
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Person {
          name: string;
          age: number;
        }
        const v: Person['name'] = 'x';
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
        }
        return createGetTypeErrors<Person['name']>();
      },
      deserializeGetTypeErrors: () => {
        interface Person {
          name: string;
          age: number;
        }
        return deserializeGetTypeErrors<Person['name']>();
      },
      getTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
        }
        const v: Person['name'] = 'x';
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Person {
          name: string;
          age: number;
        }
        const v: Person['name'] = 'x';
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: ['hello', ''],
        invalid: [42, null, undefined, true],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
        [{path: [], expected: 'string'}],
      ],
    },

    conditional_type_resolved: {
      title: 'Conditional type — T extends string ? boolean : number',
      description:
        '`T extends U ? X : Y` resolves at the type-checker layer to either X or Y depending on T. `IsString<"hello">` resolves to `boolean` here. Validation pins that the conditional threads through to the resolved shape.',
      isType: () => {
        type IsString<T> = T extends string ? boolean : number;
        return createIsType<IsString<'hello'>>();
      },
      deserializeIsType: () => {
        type IsString<T> = T extends string ? boolean : number;
        return deserializeIsType<IsString<'hello'>>();
      },
      isTypeReflect: () => {
        type IsString<T> = T extends string ? boolean : number;
        const v: IsString<'hello'> = true;
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type IsString<T> = T extends string ? boolean : number;
        const v: IsString<'hello'> = true;
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type IsString<T> = T extends string ? boolean : number;
        return createGetTypeErrors<IsString<'hello'>>();
      },
      deserializeGetTypeErrors: () => {
        type IsString<T> = T extends string ? boolean : number;
        return deserializeGetTypeErrors<IsString<'hello'>>();
      },
      getTypeErrorsReflect: () => {
        type IsString<T> = T extends string ? boolean : number;
        const v: IsString<'hello'> = true;
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type IsString<T> = T extends string ? boolean : number;
        const v: IsString<'hello'> = true;
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [true, false],
        invalid: [42, 'x', null, undefined, 0, 1],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
        [{path: [], expected: 'boolean'}],
      ],
    },

    mapped_type_custom: {
      title: 'Custom mapped type — {[K in keyof T]: T[K] | null}',
      description:
        'A user-authored mapped type that augments every prop with `| null`. Tests that resolver + emit thread custom mapped types correctly; Partial / Required / Pick etc. exercise the same machinery via the built-in utility paths.',
      isType: () => {
        interface Source {
          a: string;
          b: number;
        }
        type Nullable<T> = {[K in keyof T]: T[K] | null};
        return createIsType<Nullable<Source>>();
      },
      deserializeIsType: () => {
        interface Source {
          a: string;
          b: number;
        }
        type Nullable<T> = {[K in keyof T]: T[K] | null};
        return deserializeIsType<Nullable<Source>>();
      },
      isTypeReflect: () => {
        interface Source {
          a: string;
          b: number;
        }
        type Nullable<T> = {[K in keyof T]: T[K] | null};
        const v: Nullable<Source> = {a: 'x', b: 1};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Source {
          a: string;
          b: number;
        }
        type Nullable<T> = {[K in keyof T]: T[K] | null};
        const v: Nullable<Source> = {a: 'x', b: 1};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Source {
          a: string;
          b: number;
        }
        type Nullable<T> = {[K in keyof T]: T[K] | null};
        return createGetTypeErrors<Nullable<Source>>();
      },
      deserializeGetTypeErrors: () => {
        interface Source {
          a: string;
          b: number;
        }
        type Nullable<T> = {[K in keyof T]: T[K] | null};
        return deserializeGetTypeErrors<Nullable<Source>>();
      },
      getTypeErrorsReflect: () => {
        interface Source {
          a: string;
          b: number;
        }
        type Nullable<T> = {[K in keyof T]: T[K] | null};
        const v: Nullable<Source> = {a: 'x', b: 1};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Source {
          a: string;
          b: number;
        }
        type Nullable<T> = {[K in keyof T]: T[K] | null};
        const v: Nullable<Source> = {a: 'x', b: 1};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {a: 'x', b: 1},
          {a: null, b: 1},
          {a: 'x', b: null},
          {a: null, b: null},
        ],
        invalid: [
          {a: 42, b: 1}, // a not string|null
          {a: 'x', b: 'not number'}, // b not number|null
          {b: 1}, // missing a (undefined ∉ string|null)
          null,
          undefined,
        ],
      }),
      // Each prop's value is a union (string|null or number|null), so
      // mismatched values produce union-failure errors at the prop path.
      getExpectedErrors: () => [
        [{path: ['a'], expected: 'union'}],
        [{path: ['b'], expected: 'union'}],
        [{path: ['a'], expected: 'union'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    mapped_type_with_conditional_value: {
      title: 'Mapped type whose value is a conditional — per-prop shape diverges',
      description:
        '`{[K in keyof T]: FieldFor<T[K]>}` where `FieldFor<X>` is a conditional that produces a different object shape for each input type. The resolver evaluates the conditional per prop at the type-checker layer, so each prop ends up with its own concrete (and different) validator. Stress-tests the "two-different-validations-from-one-mapping" pattern.',
      isTypeNotes:
        'Each prop ends up with a structurally distinct shape — `name` validates as a text field, `age` as a number field, `admin` as a checkbox. The validator emits independent per-prop checks.',
      isType: () => {
        type FieldFor<T> = T extends string
          ? {kind: 'text'; value: string}
          : T extends number
            ? {kind: 'number'; value: number; min?: number}
            : T extends boolean
              ? {kind: 'checkbox'; value: boolean}
              : never;
        interface User {
          name: string;
          age: number;
          admin: boolean;
        }
        type UserForm = {[K in keyof User]: FieldFor<User[K]>};
        return createIsType<UserForm>();
      },
      deserializeIsType: () => {
        type FieldFor<T> = T extends string
          ? {kind: 'text'; value: string}
          : T extends number
            ? {kind: 'number'; value: number; min?: number}
            : T extends boolean
              ? {kind: 'checkbox'; value: boolean}
              : never;
        interface User {
          name: string;
          age: number;
          admin: boolean;
        }
        type UserForm = {[K in keyof User]: FieldFor<User[K]>};
        return deserializeIsType<UserForm>();
      },
      isTypeReflect: () => {
        type FieldFor<T> = T extends string
          ? {kind: 'text'; value: string}
          : T extends number
            ? {kind: 'number'; value: number; min?: number}
            : T extends boolean
              ? {kind: 'checkbox'; value: boolean}
              : never;
        interface User {
          name: string;
          age: number;
          admin: boolean;
        }
        type UserForm = {[K in keyof User]: FieldFor<User[K]>};
        const v: UserForm = {
          name: {kind: 'text', value: 'x'},
          age: {kind: 'number', value: 1},
          admin: {kind: 'checkbox', value: true},
        };
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type FieldFor<T> = T extends string
          ? {kind: 'text'; value: string}
          : T extends number
            ? {kind: 'number'; value: number; min?: number}
            : T extends boolean
              ? {kind: 'checkbox'; value: boolean}
              : never;
        interface User {
          name: string;
          age: number;
          admin: boolean;
        }
        type UserForm = {[K in keyof User]: FieldFor<User[K]>};
        const v: UserForm = {
          name: {kind: 'text', value: 'x'},
          age: {kind: 'number', value: 1},
          admin: {kind: 'checkbox', value: true},
        };
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type FieldFor<T> = T extends string
          ? {kind: 'text'; value: string}
          : T extends number
            ? {kind: 'number'; value: number; min?: number}
            : T extends boolean
              ? {kind: 'checkbox'; value: boolean}
              : never;
        interface User {
          name: string;
          age: number;
          admin: boolean;
        }
        type UserForm = {[K in keyof User]: FieldFor<User[K]>};
        return createGetTypeErrors<UserForm>();
      },
      deserializeGetTypeErrors: () => {
        type FieldFor<T> = T extends string
          ? {kind: 'text'; value: string}
          : T extends number
            ? {kind: 'number'; value: number; min?: number}
            : T extends boolean
              ? {kind: 'checkbox'; value: boolean}
              : never;
        interface User {
          name: string;
          age: number;
          admin: boolean;
        }
        type UserForm = {[K in keyof User]: FieldFor<User[K]>};
        return deserializeGetTypeErrors<UserForm>();
      },
      getTypeErrorsReflect: () => {
        type FieldFor<T> = T extends string
          ? {kind: 'text'; value: string}
          : T extends number
            ? {kind: 'number'; value: number; min?: number}
            : T extends boolean
              ? {kind: 'checkbox'; value: boolean}
              : never;
        interface User {
          name: string;
          age: number;
          admin: boolean;
        }
        type UserForm = {[K in keyof User]: FieldFor<User[K]>};
        const v: UserForm = {
          name: {kind: 'text', value: 'x'},
          age: {kind: 'number', value: 1},
          admin: {kind: 'checkbox', value: true},
        };
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type FieldFor<T> = T extends string
          ? {kind: 'text'; value: string}
          : T extends number
            ? {kind: 'number'; value: number; min?: number}
            : T extends boolean
              ? {kind: 'checkbox'; value: boolean}
              : never;
        interface User {
          name: string;
          age: number;
          admin: boolean;
        }
        type UserForm = {[K in keyof User]: FieldFor<User[K]>};
        const v: UserForm = {
          name: {kind: 'text', value: 'x'},
          age: {kind: 'number', value: 1},
          admin: {kind: 'checkbox', value: true},
        };
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {
            name: {kind: 'text', value: 'Alice'},
            age: {kind: 'number', value: 30},
            admin: {kind: 'checkbox', value: true},
          },
          // age.min is optional
          {
            name: {kind: 'text', value: 'B'},
            age: {kind: 'number', value: 1, min: 0},
            admin: {kind: 'checkbox', value: false},
          },
        ],
        invalid: [
          // age.kind wrong literal
          {
            name: {kind: 'text', value: 'x'},
            age: {kind: 'text', value: 1},
            admin: {kind: 'checkbox', value: true},
          },
          // name.value wrong type
          {
            name: {kind: 'text', value: 42},
            age: {kind: 'number', value: 1},
            admin: {kind: 'checkbox', value: true},
          },
          // missing required prop
          {
            name: {kind: 'text', value: 'x'},
            age: {kind: 'number', value: 1},
          },
          null,
          undefined,
        ],
      }),
      getExpectedErrors: () => [
        // age.kind is 'text' but the resolved type for age says it
        // must be 'number' literal.
        [{path: ['age', 'kind'], expected: 'literal'}],
        // name.value wrong type — must be string.
        [{path: ['name', 'value'], expected: 'string'}],
        // missing admin → admin is undefined → object check at ['admin'] fails.
        [{path: ['admin'], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    distributive_conditional_over_union: {
      title: 'Distributive conditional — `Wrap<string | number>` → `{w:string} | {w:number}`',
      description:
        'When a conditional type is applied to a generic union, TS distributes the conditional over each member, producing a union of the per-arm results. `T extends any ? {w: T} : never` applied to `string | number` resolves to `{w: string} | {w: number}`. Validator dispatches through the union emit.',
      isType: () => {
        type Wrap<T> = T extends any ? {w: T} : never;
        return createIsType<Wrap<string | number>>();
      },
      deserializeIsType: () => {
        type Wrap<T> = T extends any ? {w: T} : never;
        return deserializeIsType<Wrap<string | number>>();
      },
      isTypeReflect: () => {
        type Wrap<T> = T extends any ? {w: T} : never;
        const v: Wrap<string | number> = {w: 'x'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        type Wrap<T> = T extends any ? {w: T} : never;
        const v: Wrap<string | number> = {w: 'x'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        type Wrap<T> = T extends any ? {w: T} : never;
        return createGetTypeErrors<Wrap<string | number>>();
      },
      deserializeGetTypeErrors: () => {
        type Wrap<T> = T extends any ? {w: T} : never;
        return deserializeGetTypeErrors<Wrap<string | number>>();
      },
      getTypeErrorsReflect: () => {
        type Wrap<T> = T extends any ? {w: T} : never;
        const v: Wrap<string | number> = {w: 'x'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        type Wrap<T> = T extends any ? {w: T} : never;
        const v: Wrap<string | number> = {w: 'x'};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [{w: 'hello'}, {w: 42}],
        invalid: [{w: true}, {w: null}, {}, null, undefined, {w: NaN}],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
        [{path: [], expected: 'union'}],
      ],
    },

    deep_partial_recursive_mapped: {
      title: 'DeepPartial<T> — recursive mapped type with nested optionality',
      description:
        '`type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]}`. Recursively makes every nested object-typed property optional. The resolver evaluates the recursion at the type-checker layer; the validator sees the fully flattened all-optional-deep shape.',
      isTypeNotes:
        'Every nested object becomes all-optional. The `allOptionalCode` guard fires at every level so non-plain-object inputs (arrays, Date, …) are rejected even though the all-optional shape would otherwise accept them.',
      isType: () => {
        interface Settings {
          display: {theme: 'light' | 'dark'; brightness: number};
          audio: {volume: number; muted: boolean};
        }
        type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
        return createIsType<DeepPartial<Settings>>();
      },
      deserializeIsType: () => {
        interface Settings {
          display: {theme: 'light' | 'dark'; brightness: number};
          audio: {volume: number; muted: boolean};
        }
        type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
        return deserializeIsType<DeepPartial<Settings>>();
      },
      isTypeReflect: () => {
        interface Settings {
          display: {theme: 'light' | 'dark'; brightness: number};
          audio: {volume: number; muted: boolean};
        }
        type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
        const v: DeepPartial<Settings> = {};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Settings {
          display: {theme: 'light' | 'dark'; brightness: number};
          audio: {volume: number; muted: boolean};
        }
        type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
        const v: DeepPartial<Settings> = {};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Settings {
          display: {theme: 'light' | 'dark'; brightness: number};
          audio: {volume: number; muted: boolean};
        }
        type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
        return createGetTypeErrors<DeepPartial<Settings>>();
      },
      deserializeGetTypeErrors: () => {
        interface Settings {
          display: {theme: 'light' | 'dark'; brightness: number};
          audio: {volume: number; muted: boolean};
        }
        type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
        return deserializeGetTypeErrors<DeepPartial<Settings>>();
      },
      getTypeErrorsReflect: () => {
        interface Settings {
          display: {theme: 'light' | 'dark'; brightness: number};
          audio: {volume: number; muted: boolean};
        }
        type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
        const v: DeepPartial<Settings> = {};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Settings {
          display: {theme: 'light' | 'dark'; brightness: number};
          audio: {volume: number; muted: boolean};
        }
        type DeepPartial<T> = {[K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K]};
        const v: DeepPartial<Settings> = {};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {},
          {display: {}},
          {audio: {volume: 1}},
          {display: {theme: 'light'}, audio: {muted: true}},
          {display: {theme: 'dark', brightness: 0.5}, audio: {volume: 1, muted: false}},
        ],
        invalid: [
          [], // allOptionalCode guard rejects arrays at the outer level
          new Date(), // same — Date is not '[object Object]'
          {display: 'not object'}, // nested object expected
          {display: {theme: 'invalid'}}, // literal-union arm fails
          {audio: {volume: NaN}}, // NaN fails number
          null,
          undefined,
        ],
      }),
      getExpectedErrors: () => [
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: ['display'], expected: 'objectLiteral'}],
        // theme is a literal union 'light'|'dark', 'invalid' fails the
        // union check at ['display', 'theme'].
        [{path: ['display', 'theme'], expected: 'union'}],
        [{path: ['audio', 'volume'], expected: 'number'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },
  },

  // TYPE_MAPPINGS — key-remapping mapped types (TS 4.1+ `as` clause).
  // Common pattern in DB-access code, API-adapter layers, and any
  // place a wire-format shape differs from the in-memory shape.
  //
  // Three canonical patterns:
  //  - Prefix / suffix all keys via template-literal in the `as` clause
  //  - Conditional rename: swap specific keys, leave others
  //  - Filter via `never`: drop keys from the resulting shape
  //
  // All of these resolve at the type-checker layer to a concrete
  // object shape with the new key set, so the validator handles them
  // with the existing object-emit machinery — no key-mapping pass at
  // runtime; the rewrite is baked into the resolved type.
  TYPE_MAPPINGS: {
    key_prefix_rename: {
      title: 'Key prefix via template literal — `prefix_${K}` rename',
      description:
        'TS 4.1+ key remapping: `{[K in keyof T as `prefix_${K & string}`]: T[K]}`. Resolves to a fully concrete object literal with renamed keys; each value type is carried over unchanged. Common pattern for DB column-name prefixing (`user_id`, `user_name`).',
      isType: () => {
        interface Source {
          id: number;
          name: string;
        }
        type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
        return createIsType<Prefixed<Source>>();
      },
      deserializeIsType: () => {
        interface Source {
          id: number;
          name: string;
        }
        type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
        return deserializeIsType<Prefixed<Source>>();
      },
      isTypeReflect: () => {
        interface Source {
          id: number;
          name: string;
        }
        type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
        const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Source {
          id: number;
          name: string;
        }
        type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
        const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Source {
          id: number;
          name: string;
        }
        type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
        return createGetTypeErrors<Prefixed<Source>>();
      },
      deserializeGetTypeErrors: () => {
        interface Source {
          id: number;
          name: string;
        }
        type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
        return deserializeGetTypeErrors<Prefixed<Source>>();
      },
      getTypeErrorsReflect: () => {
        interface Source {
          id: number;
          name: string;
        }
        type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
        const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Source {
          id: number;
          name: string;
        }
        type Prefixed<T> = {[K in keyof T as `user_${K & string}`]: T[K]};
        const v: Prefixed<Source> = {user_id: 1, user_name: 'x'};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {user_id: 1, user_name: 'x'},
          {user_id: 0, user_name: ''},
        ],
        invalid: [
          {id: 1, name: 'x'}, // original (un-prefixed) keys — both required prefixed keys missing
          {user_id: 'not number', user_name: 'x'},
          {user_id: 1}, // missing user_name
          null,
          undefined,
        ],
      }),
      getExpectedErrors: () => [
        [
          {path: ['user_id'], expected: 'number'},
          {path: ['user_name'], expected: 'string'},
        ],
        [{path: ['user_id'], expected: 'number'}],
        [{path: ['user_name'], expected: 'string'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    key_conditional_rename: {
      title: 'Conditional key rename — swap one key, leave the rest',
      description:
        '`{[K in keyof T as K extends "id" ? "_id" : K]: T[K]}`. Renames a single specific key (`id` → `_id` — Mongo-style); other keys pass through unchanged.',
      isType: () => {
        interface Source {
          id: number;
          name: string;
          createdAt: Date;
        }
        type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
        return createIsType<MongoForm<Source>>();
      },
      deserializeIsType: () => {
        interface Source {
          id: number;
          name: string;
          createdAt: Date;
        }
        type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
        return deserializeIsType<MongoForm<Source>>();
      },
      isTypeReflect: () => {
        interface Source {
          id: number;
          name: string;
          createdAt: Date;
        }
        type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
        const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Source {
          id: number;
          name: string;
          createdAt: Date;
        }
        type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
        const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Source {
          id: number;
          name: string;
          createdAt: Date;
        }
        type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
        return createGetTypeErrors<MongoForm<Source>>();
      },
      deserializeGetTypeErrors: () => {
        interface Source {
          id: number;
          name: string;
          createdAt: Date;
        }
        type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
        return deserializeGetTypeErrors<MongoForm<Source>>();
      },
      getTypeErrorsReflect: () => {
        interface Source {
          id: number;
          name: string;
          createdAt: Date;
        }
        type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
        const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Source {
          id: number;
          name: string;
          createdAt: Date;
        }
        type MongoForm<T> = {[K in keyof T as K extends 'id' ? '_id' : K]: T[K]};
        const v: MongoForm<Source> = {_id: 1, name: 'x', createdAt: new Date()};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [{_id: 1, name: 'x', createdAt: new Date()}],
        invalid: [
          // Original `id` key — renamed away, so `_id` is missing.
          {id: 1, name: 'x', createdAt: new Date()},
          // Wrong type at renamed slot.
          {_id: 'not number', name: 'x', createdAt: new Date()},
          // Missing the non-renamed `createdAt`.
          {_id: 1, name: 'x'},
          null,
          undefined,
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['_id'], expected: 'number'}],
        [{path: ['_id'], expected: 'number'}],
        [{path: ['createdAt'], expected: 'date'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },

    key_filter_via_never: {
      title: 'Filter keys via `never` — drop sensitive props',
      description:
        '`{[K in keyof T as K extends "secret" ? never : K]: T[K]}`. Mapping a key to `never` drops it from the resulting shape entirely (TS 4.1+ semantic). Useful for stripping internal-only / secret fields when exposing a wire shape.',
      isTypeNotes:
        'Dropped keys are NOT present in the resolved type. The validator does NOT check whether the dropped key is absent — structural typing allows extra props, so a value carrying the dropped key still passes (the key is simply ignored).',
      isType: () => {
        interface Source {
          id: number;
          name: string;
          secret: string;
        }
        type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
        return createIsType<Public<Source>>();
      },
      deserializeIsType: () => {
        interface Source {
          id: number;
          name: string;
          secret: string;
        }
        type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
        return deserializeIsType<Public<Source>>();
      },
      isTypeReflect: () => {
        interface Source {
          id: number;
          name: string;
          secret: string;
        }
        type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
        const v: Public<Source> = {id: 1, name: 'x'};
        return createIsType(v);
      },
      deserializeIsTypeReflect: () => {
        interface Source {
          id: number;
          name: string;
          secret: string;
        }
        type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
        const v: Public<Source> = {id: 1, name: 'x'};
        return deserializeIsType(v);
      },
      getTypeErrors: () => {
        interface Source {
          id: number;
          name: string;
          secret: string;
        }
        type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
        return createGetTypeErrors<Public<Source>>();
      },
      deserializeGetTypeErrors: () => {
        interface Source {
          id: number;
          name: string;
          secret: string;
        }
        type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
        return deserializeGetTypeErrors<Public<Source>>();
      },
      getTypeErrorsReflect: () => {
        interface Source {
          id: number;
          name: string;
          secret: string;
        }
        type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
        const v: Public<Source> = {id: 1, name: 'x'};
        return createGetTypeErrors(v);
      },
      deserializeGetTypeErrorsReflect: () => {
        interface Source {
          id: number;
          name: string;
          secret: string;
        }
        type Public<T> = {[K in keyof T as K extends 'secret' ? never : K]: T[K]};
        const v: Public<Source> = {id: 1, name: 'x'};
        return deserializeGetTypeErrors(v);
      },
      getSamples: () => ({
        valid: [
          {id: 1, name: 'x'},
          // Extra `secret` prop passes (structural typing — the
          // resolved shape doesn't know about it).
          {id: 1, name: 'x', secret: 'oops'},
        ],
        invalid: [
          {id: 1}, // missing name
          {name: 'x'}, // missing id
          {id: 'not number', name: 'x'},
          null,
          undefined,
        ],
      }),
      getExpectedErrors: () => [
        [{path: ['name'], expected: 'string'}],
        [{path: ['id'], expected: 'number'}],
        [{path: ['id'], expected: 'number'}],
        [{path: [], expected: 'objectLiteral'}],
        [{path: [], expected: 'objectLiteral'}],
      ],
    },
  },
} as const satisfies {
  ATOMIC: Record<string, JitCase>;
  ARRAY: Record<string, JitCase>;
  OBJECT: Record<string, JitCase>;
  TUPLE: Record<string, JitCase>;
  UNION: Record<string, JitCase>;
  TEMPLATE_LITERAL: Record<string, JitCase>;
  NATIVE: Record<string, JitCase>;
  CIRCULAR: Record<string, JitCase>;
  UTILITY: Record<string, JitCase>;
  TYPE_MAPPINGS: Record<string, JitCase>;
};
