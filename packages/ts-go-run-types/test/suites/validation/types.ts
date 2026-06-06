import type {IsTypeFn, GetTypeErrorsFn, RunTypeError, MockTypeFn} from '@mionjs/ts-go-run-types';

/** Thunk that returns the variant's function, OR the `'not-supported'`
 *  sentinel marking the variant as deliberately unsupported on this case
 *  (e.g. a value-first schema for a case that needs an `IsTypeOptions` flag
 *  the value-first builders can't carry).
 *
 *  - Field omitted entirely → "not implemented" gap (test title suffixed
 *    with `(not implemented)`, no warning).
 *  - `'not-supported'` sentinel → known design limitation (test title
 *    suffixed with `(not supported)`, assert emits a once-per-(case, variant)
 *    `console.warn`).
 *  - Function → normal variant; assert runs it. **/
export type Thunk<T> = (() => T) | 'not-supported';

/** One atomic-type case in the shared suite. */
export interface ValidationCase {
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
  isType?: Thunk<IsTypeFn>;
  /** Plugin-rewritten thunk returning the isType validator — REFLECT
   *  form. Calls `createIsType(value)` with a runtime value annotated
   *  to type T; the type checker infers T from the annotation, the
   *  value itself is discarded at runtime. Paired with `isType` per
   *  the CLAUDE.md "Marker test coverage rule" to verify both call
   *  shapes produce the same validator end-to-end. **/
  isTypeReflect?: Thunk<IsTypeFn>;
  /** Plugin-rewritten thunk returning the validator rebuilt from the
   *  serialized `RTCompiledFnData.code` body via
   *  `new Function('utl', code)(rtUtils)` — exercises the
   *  serialize → deserialize round-trip the over-the-wire cache uses.
   *  Same call shape as `isType` (static form). **/
  deserializeIsType?: Thunk<IsTypeFn>;
  /** Reflect-form companion to `deserializeIsType`. **/
  deserializeIsTypeReflect?: Thunk<IsTypeFn>;
  /** SCHEMA form: `() => createIsType(<value-first builder schema>)`. Builds
   *  the validator from a `define` builder result (a `RunType` value) instead of
   *  reflecting a type — the value-first authoring path. Run against the same
   *  samples as `isType`. Present only on leaf-buildable cases. Set to
   *  `'not-supported'` to mark a case whose schema variant CANNOT be authored
   *  value-first (e.g. depends on an `IsTypeOptions` flag the builders can't
   *  carry) — the assert logs once and the title shows `(not supported)`. **/
  isTypeSchema?: Thunk<IsTypeFn>;
  /** Plugin-rewritten thunk returning the getTypeErrors validator —
   *  STATIC form. Caller supplies `T` explicitly. Same dispatch and
   *  caching as `isType` but the validator returns `RunTypeError[]`
   *  instead of a boolean (matches mion's `RTFunctions.typeErrors`). */
  getTypeErrors?: Thunk<GetTypeErrorsFn>;
  /** Plugin-rewritten thunk returning the getTypeErrors validator —
   *  REFLECT form. `T` inferred from a runtime value's declared type. */
  getTypeErrorsReflect?: Thunk<GetTypeErrorsFn>;
  /** Plugin-rewritten thunk returning the getTypeErrors validator
   *  rebuilt from the serialized `RTCompiledFnData.code` body via
   *  `new Function('utl', code)(rtUtils)` — exercises the
   *  serialize → deserialize round-trip the over-the-wire cache uses.
   *  Same call shape as `getTypeErrors` (static form). */
  deserializeGetTypeErrors?: Thunk<GetTypeErrorsFn>;
  /** Reflect-form companion to `deserializeGetTypeErrors`. */
  deserializeGetTypeErrorsReflect?: Thunk<GetTypeErrorsFn>;
  /** SCHEMA form: `() => createGetTypeErrors(<value-first builder schema>)`.
   *  Companion to `isTypeSchema` for the getTypeErrors family. Supports the
   *  same `'not-supported'` sentinel. **/
  getTypeErrorsSchema?: Thunk<GetTypeErrorsFn>;
  /** Expected error arrays for invalid samples — index-parallel to
   *  `getSamples().invalid`. Outer array length must match
   *  `invalid.length`; entry i is the `RunTypeError[]` the validator
   *  should produce for `invalid[i]`. Valid samples always expect `[]`.
   *  Omit on cases that don't declare `getTypeErrors`. */
  getExpectedErrors?: () => RunTypeError[][];

  /** Plugin-rewritten thunk returning the mock generator — STATIC
   *  form. Caller supplies `T` explicitly. The adapter generates N
   *  values (default 20) and asserts each passes `isType<T>()`. */
  mockType?: Thunk<MockTypeFn<unknown>>;
  /** Plugin-rewritten thunk returning the mock generator — REFLECT
   *  form. `T` inferred from a runtime value's declared type. */
  mockTypeReflect?: Thunk<MockTypeFn<unknown>>;
  /** Adapter expectation for the mock case:
   *  - `'value'` (default) — every generated value must pass `isType<T>()`.
   *  - `'throw'` — calling the mock fn must throw (e.g. `never`).
   *  - `'skip'` — the mock fn runs but its output is not isType-checked
   *    (e.g. function kinds where mion returns `undefined`). **/
  mockTypeExpect?: 'value' | 'throw' | 'skip';

  /** When true, every adapter thunk (isType / getTypeErrors / mockType
   *  and their deserialize / reflect variants) is expected to throw
   *  on invocation. Used for kinds that are unsupported at root —
   *  the Go pipeline renders the factory as an `alwaysThrow` entry,
   *  so the very first `createXxx<T>()` call surfaces the build-time
   *  diagnostic at runtime. See docs/UNSUPPORTED-KINDS.md.
   *
   *  `getSamples` / `getExpectedErrors` are not consulted when this
   *  flag is set — the test stops at the throw assertion. **/
  factoryThrows?: boolean;

  /** Pure sample data — same for every adapter. */
  getSamples: () => {valid: unknown[]; invalid: unknown[]};
}
