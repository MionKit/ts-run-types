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
  /** DATA-ONLY form: `() => createIsType<DataOnly<T>>()` — the SAME `T` as
   *  `isType`, wrapped in `DataOnly<…>`. Proves the `DataOnly` type mapping
   *  drops exactly what the AOT validator emitter drops: a `DataOnly<T>` call
   *  site must resolve to the SAME structural id (hence the SAME cached
   *  factory, by reference) as the bare-`T` call site. Asserted in the
   *  id-integrity DataOnly suite via `.toBe(isType())`. Wrap `DataOnly` at the
   *  literal call site (NOT behind a generic helper) — the plugin resolves the
   *  type argument where it is written. Set `dataOnlyDivergent` for the
   *  root-level non-data kinds whose ids cannot converge. **/
  isTypeDataOnly?: Thunk<IsTypeFn>;
  /** SCHEMA form: `() => createIsType(<value-first builder schema>)`. Builds
   *  the validator from a `define` builder result (a `RunType` value) instead of
   *  reflecting a type — the value-first authoring path. Run against the same
   *  samples as `isType`. Required on every case: supply a thunk, or the
   *  `'not-supported'` sentinel to mark a case whose schema variant CANNOT be
   *  authored value-first (e.g. depends on an `IsTypeOptions` flag the builders
   *  can't carry) — the assert then logs once and the title shows
   *  `(not supported)`. **/
  isTypeSchema: Thunk<IsTypeFn>;
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
  /** DATA-ONLY form: `() => createGetTypeErrors<DataOnly<T>>()`. Companion to
   *  `isTypeDataOnly` for the getTypeErrors family — must resolve the SAME
   *  cached factory as the bare-`T` `getTypeErrors` thunk. **/
  getTypeErrorsDataOnly?: Thunk<GetTypeErrorsFn>;
  /** SCHEMA form: `() => createGetTypeErrors(<value-first builder schema>)`.
   *  Companion to `isTypeSchema` for the getTypeErrors family. Required on every
   *  case; supports the same `'not-supported'` sentinel for a case whose schema
   *  variant CANNOT be authored value-first. **/
  getTypeErrorsSchema: Thunk<GetTypeErrorsFn>;
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

  /** Opt a case out of the id-integrity suite (`assertValidatorIdIntegrity`):
   *  its value-first schema form and type-first form are KNOWN not to resolve the
   *  same structural id, by design. Reserved for cases where convergence is
   *  genuinely impossible — leave UNSET for cases that should converge so a
   *  regression surfaces as a failure. (Note: option cases like `noLiterals` /
   *  `noIsArrayCheck` are NOT divergent — they converge once the schema thunk
   *  mirrors the same option, e.g. `createIsType(RT.literal(2), {noLiterals: true})`.) **/
  idDivergent?: boolean;

  /** Opt a case out of the DataOnly-equivalence suite
   *  (`assertDataOnlyEquivalence`): `createIsType<DataOnly<T>>()` is KNOWN not to
   *  validate the same way as `createIsType<T>()`, by design, because `DataOnly`
   *  is a purely STRUCTURAL projection and `T` is validated by NATIVE or NOMINAL
   *  identity (which a structural mapping can't preserve), or `T` has a shape the
   *  mapping can't reconstruct. Known divergent families:
   *   - root-level non-data kinds where `DataOnly<T>` collapses to `never`
   *     (bare function type, callable interface, `symbol`);
   *   - native-identity leaves the emitter treats atomically but `DataOnly`
   *     maps structurally (the TC39 `Temporal.*` types and `Temporal.X & {brand}`
   *     format types);
   *   - nominal `class` types (DataOnly projects the instance to a plain object,
   *     so the validated kind becomes `objectLiteral` instead of `class`);
   *   - degenerate tuple shapes the homomorphic mapped type can't preserve
   *     (a trailing rest `...T[]`, a self-referential slot, or a function slot
   *     the emitter keeps as a `notSupported`/`undefined` node).
   *  Leave UNSET for every case that SHOULD converge so a DataOnly↔emitter
   *  regression surfaces as a failure. **/
  dataOnlyDivergent?: boolean;

  /** Pure sample data — same for every adapter. */
  getSamples: () => {valid: unknown[]; invalid: unknown[]};
}
