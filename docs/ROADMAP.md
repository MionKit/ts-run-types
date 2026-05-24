# Roadmap

Living document. Captures **what's implemented**, **what's deliberately out of scope** (and why), and **open questions parked for later**.

---

## Status snapshot

| Component                           | Status     | Notes                                                                           |
| ----------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| Go resolver + checker integration   | ✅         | `scanFiles` + `dump` ops over stdio (`--one-shot`) and Unix socket (`--daemon`) |
| Reflection-shape projection         | ✅         | `*checker.Type` → `protocol.Type` discriminated union, dedup by structural id   |
| Wire formats                        | ✅         | JSON dump + self-wired TS module (`--out-json` / `--out-ts`)                    |
| Vite plugin                         | ✅         | byte-offset rewriter, `virtual:runtypes-cache` module                           |
| Go fixture tests                    | ✅         | F1–F30 + atomic / object / circular kinds                                       |
| Vite plugin tests                   | ✅         | rewrite, atomic, wrapping + projection suites — all green                                      |
| `isType` RT emit                   | ✅         | every mion node category ported; see `test/adapters/isType.test.ts`             |
| `templateLiteral` projection+emit   | ✅         | regex-compile at RT-build time; also wired into index-signature key patterns   |
| Native containers (Map/Set/Promise) | ✅         | `instanceof` + iteration over `.entries()` / `.values()`; thenable check        |
| Docs                                | ✅         | ARCHITECTURE.md "Reflection shape" section                                      |
| String type-formats                 | ✅         | `@mionjs/ts-go-run-types/formats` — StringFormat/UUID/Date/Time/DateTime/IP/Domain/Email/URL/DefaultStringFormats; brand scanner + idempotent hashing |
| Number/bigint type-formats          | ✅         | Go: `internal/compiled/typefns/formats/numeric/{numberformat.go,bigintformat.go}`; JS: `packages/ts-go-run-types/src/formats/{numberFormats.ts,bigintFormats.ts}` |
| Binary serialization                | ✅         | Go: `internal/compiled/typefns/{binary_to.go,binary_from.go}`; JS: `packages/ts-go-run-types/src/{createBinary.ts,runtypes/dataView.ts}`; allOptional/paramsSlice router conveniences intentionally not ported (see "Binary serialization — function-params router conveniences") |
| Generic type-metadata (`typeMeta`)  | ✅         | any `atomic & { obj }` intersection surfaces its object members as opaque `typeMeta` (renamed from `decorators`; subsumes the old number `brand`). TS `@decorator`-syntax capture + validating constraint decorators (`MinLength<5>`) remain out of scope |
| `infer` kind                        | ❌ pending | reserved in the enum, only meaningful inside unresolved conditional types       |
| Pre-process build mode              | ❌ pending | bundler-agnostic CLI that writes the cache without Vite                         |
| Serializer circular-detection       | ❌ pending | typefns currently treats every compound as non-inlined as a safer default       |

---

## Compile-time only — what we will never capture

`ts-go-run-types` is a **compile-time, structural** reflection system. The cache is a JSON-shaped graph of `Type` nodes; the only legitimate runtime-valued payload it carries is **literal data** (numbers, strings, booleans, null, undefined, bigints, regexps, symbols-by-description). Every other field that exists in the mion runtypes runtime model but only has meaning as a _live JS value_ is **deliberately not captured**, and there is no plan to add it.

This is a design choice, not a missing feature: structural type checking only needs the shape, and binding the cache to live JS values would re-introduce the bundler/tooling coupling we left tsc to escape.

| Runtime-only field                     | Why we won't emit it                                                                                                                                                                                                                                                                          |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TypeFunction.function?: Function`     | The closure is a JS value. Structural validation needs the signature (parameters + return), which we already emit. If a consumer needs to _call_ the function, they import it.                                                                                                                |
| `TypeClass.classType: ClassType`       | The constructor reference is a JS value. We emit the structural shape (`types`, `extendsArguments`, `implements`) and `classRef` provenance for builtins (`Date`/`Map`/`Set`/`RegExp` resolved to `globalThis.<Name>` in the `.ts` footer). User-class constructor wiring is **not** planned. |
| `TypeEnum.enum: object`                | Enum object identity is a JS value. We emit `values` (and would emit a synthetic `{[name]: value}` for const enums if needed) — sufficient for structural checks.                                                                                                                             |
| `default?: () => any` (param/property) | Default _expressions_ are arbitrary JS. Literal defaults (`5`, `"foo"`, `true`, `null`) are inlined; non-literal defaults are dropped with `flags: ["nonLiteralDefault"]`.                                                                                                                    |
| `RTContainer`                         | Consumer-side RT cache. Populated lazily by the runtypes runtime on first use.                                                                                                                                                                                                               |
| `TypeInfer.set(type)`                  | Runtime mutation hook for unresolved conditional types. The checker has already resolved them by the time we project, so consumers never see an unresolved `infer T`.                                                                                                                         |

### Literal regexps — the one transform

JSON cannot carry a `RegExp` instance, but the _literal_ `RegExp` is compile-time-known data (source + flags). The serializer encodes it as `{regexp: {source, flags}}` in JSON; the generated `.ts` artifact's footer rehydrates it via `t.literal = new RegExp(source, flags)`. Same pattern as `bigint` (string + `BigInt(...)`) and `symbol` (description + `Symbol(...)`). Consumers reading the JSON directly get the structured form.

---

## Known gaps with planned workarounds

These are real reflection features we intend to ship; each has a concrete approach.

### Reflection features that need AST-level scanning beyond tsgo's checker

| Feature                                      | Where it lives                                                     | Approach                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| String type-formats (`FormatEmail`, `FormatUUIDv4`, …) | `@mionjs/ts-go-run-types/formats` (JS) + `internal/compiled/typefns/formats/` (Go) | **Done.** The `TypeFormat<Base, Name, Params, Brand>` brand lowers to a `Base & {__rtFormatName; __rtFormatParams}` intersection; the scanner in `internal/compiled/runtype/typeid/formats.go` lifts it into `RunType.FormatAnnotation` and folds the canonicalised params into the structural id (idempotent cache key). Per-format Go emitters splice the validator into the `isType` / `typeErrors` body. |
| Number/bigint formats (`FormatInteger`, `FormatFloat`, …) | `@mionjs/ts-go-run-types/formats` (JS) + `internal/compiled/typefns/formats/numeric/` (Go) | **Done.** Reuses the same format pipeline as string formats. Go: `numberformat.go` / `bigintformat.go`; JS: `numberFormats.ts` / `bigintFormats.ts`. |
| Decorators (`MinLength<5>`, `Email`, etc.)   | Comment-pragma or branded type aliases parsed by a TS transformer. | The format brand scanner is the first instance of this pattern. General-purpose decorators (arbitrary brand objects beyond the format name+params shape) still need their own recognition pass. |
| `inlined: true` flag                         | Set when a type is inlined rather than referenced by name.         | Derive from "did we have an alias symbol?" — emit `inlined: true` for anonymous types. Field is already in the protocol, just not populated.                |
| `originTypes: { typeName, typeArguments }[]` | Tracks each layer of type-alias unwrapping.                        | Walk the alias chain in tsgo (each alias has a target). Add when needed — not blocking for the runtypes RT.                                                |
| `indexAccessOrigin`                          | Provenance for `T["key"]` resolved types.                          | tsgo's `IndexedAccessType` has the container + index types. Emit when we hit `TypeFlagsIndexedAccess`.                                                      |

### `isType` emit — port complete

Every mion `isType` node category is ported with end-to-end test coverage: **all active validation cases passing, 0 deferred** in `packages/ts-go-run-types/test/adapters/isType.test.ts` (one `describe(...)` block per category, each with its own drift-guard counter).

| Category                                                                                                           | `describe` block            | Highlights                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Atomic (any/unknown/never/void/null/undefined/string/number/boolean/bigint/symbol/object/regexp/literal/enum/Date) | `isType / ATOMIC`           | Includes `noLiterals` option variants.                                                                                                                                                                                                                                                |
| Array                                                                                                              | `isType / ARRAY`            | Circular self-reference, 2D / 3D, `noIsArrayCheck`, array-of-objects, array-of-unions, array-of-tuples, `symbol[]` non-serializable.                                                                                                                                                  |
| Object (interface / class / property / method / index signature / call signature / function)                       | `isType / OBJECT`           | Plain user class with `prototype`-filter, RpcError-shape, all-optional w/ `allOptionalCode` guard, callable interface (`isCallable()` branch), `Parameters<F>` for CallSignature param validation, `Record<UnionKey, V>`.                                                             |
| Tuple                                                                                                              | `isType / TUPLE`            | Optional members, rest (`[A, ...B[]]`), circular self-reference, non-serializable function slot, trailing-optionals chain, named tuple labels.                                                                                                                                        |
| Union                                                                                                              | `isType / UNION`            | Union-of-objects, discriminated unions, union with methods, circular unions, intersection (resolved to ObjectLiteral by tsgo).                                                                                                                                                        |
| TemplateLiteral                                                                                                    | `isType / TEMPLATE_LITERAL` | Regex-escape edge cases, multi-segment URLs, nested-in-object, index-signature key pattern, union-placeholder.                                                                                                                                                                        |
| Native                                                                                                             | `isType / NATIVE`           | `Map<K, V>` (`instanceof` + `.entries()`), `Set<T>` (`.values()`), `Promise<T>` (thenable), `Awaited<P>`.                                                                                                                                                                             |
| Utility                                                                                                            | `isType / UTILITY`          | `Partial` / `Required` / `Pick` / `Omit` / `Exclude` (atomic + object-union) / `Extract` / `NonNullable` / `ReturnType` / `Readonly` + intersection-with-required-override + Omit-keeping-optional. tsgo resolves utilities eagerly so no new emit needed — pure regression coverage. |

The validation suite's `as const satisfies` type guard catches drift between the suite and the adapter `describe` blocks. Each block's "all cases ran" counter test catches forgotten `it()` registrations.

**Renderer-side architecture**: composite emits propagate a `CodeNS` sentinel from any unsupported leaf upward through the existing compile pass; the renderer's dangling-dep cascade then drops any entry whose recorded deps weren't emitted. Replaces an earlier O(M·S) `subtreeFullySupported` pre-walk; runtime behavior is unchanged (unsupported types silently absent, createIsType-side noop fallback `() => true` handles the cache miss). See `internal/compiled/typefns/codetype.go` → `CodeNS` for the full contract.

**Out of scope for `isType`** (and tracked separately, will live in the validation-constraints library):

- Number brand types (`int` / `uint8` / `Range<a, b>` / …)
- String-mapping constraint forms (`Uppercase<string>` as a generic constraint; the literal-collapsed forms work today via the standard literal-equality check)

### Reflection Type variants not yet projected

- `infer` (kind 34) — `infer T` placeholder. Only meaningful inside unresolved conditional types, which tsgo eagerly resolves; would only appear if we add an op that returns the unresolved form.
- `rest` (kind 29) outside tuples — function rest parameters. Currently marked with a `flags` entry; the dedicated `rest` Type variant comes later.
- `enumMember` (kind 28) standalone — we emit `enum.values` but not per-member `TypeEnumMember` nodes. Add when needed.

### JSON shape — known limitations and how we handle them

| Limitation                  | Cause                                 | Handling                                                                                                                                                                                                                                                   |
| --------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cyclic types in raw JSON    | JSON has no cycle support.            | Refs are sentinels (`{kind: -1, id: "<hash>"}`) in JSON; the generated `.ts` artifact resolves cycles via direct `const` assignment in the footer. JSON-only consumers walk the table to re-knot.                                                          |
| `parent` back-references    | Same — JSON has no cycles.            | Not emitted at all. Canonical nodes are shared singletons (one per structural id) so a stored `parent` would be wrong for any node with multiple parents. Consumers that need a parent link build it themselves while walking the graph from a known root. |
| Symbol-keyed property names | JSON has no symbol type.              | Emit synthetic `@@<name>` strings + `flags: ["symbol"]`. Round-tripping symbol _identity_ would require a runtime symbol registry — out of scope.                                                                                                          |
| `bigint` literal values     | JSON numbers lose precision past 2⁵³. | Emit as a string with `flags: ["bigint"]`; the `.ts` footer re-hydrates with `BigInt(...)`. JSON consumers do the same.                                                                                                                                    |
| `regexp` literal values     | JSON has no `RegExp` type.            | Emit `{regexp: {source, flags}}`; the `.ts` footer re-hydrates with `new RegExp(source, flags)`. JSON consumers do the same.                                                                                                                               |
| `symbol` literal values     | JSON has no symbol type.              | Emit description string; the `.ts` footer re-hydrates with `Symbol(desc)`. Identity is not preserved — same caveat as symbol-keyed names.                                                                                                                  |

### Union discriminator wire shape — `unionDiscriminators[]`

Mion's codegen path for discriminated unions consumes a `FlattenedProp` struct per object member (see `mion-run-types: packages/run-types/src/nodes/collection/unionDiscriminator.ts`). Our wire stores **only the strictly-new field** — a ref to the discriminator property — on the union node:

```ts
// On a TypeUnion RunType:
unionDiscriminators?: (RunType | null | undefined)[];
// Parallel to `safeUnionChildren`. Entry i is a ref to the discriminator
// property within safeUnionChildren[i]; null/undefined for non-object
// slots (simple / any). Absent when neither detection pass finds a
// usable discriminator.
```

Everything else mion's `FlattenedProp` carries is reconstructible from the surrounding wire shape. Consumers call `flattenUnionDiscriminators` from `@mionjs/ts-go-run-types` to materialise the full per-member struct in one pass — it pairs each `safeUnionChildren[i]` with the parallel `unionDiscriminators[i]` and resolves the property's `typeID` via `prop.child.id`.

Rationale: the wire format leans on dedup/minimality elsewhere; carrying `unionItem` / `unionIndex` / `typeID` directly would duplicate data already on the wire (`safeUnionChildren[i]`, the index itself, and the property's child ref id respectively). The detection passes (shared-name + unique-prop fallback) live on the Go side (`internal/compiled/runtype/union_safeorder.go`); both write into this single slot, scoped to the parent union — a property node shared between two unions is independently classified for each parent.

`compiledName` in mion's struct is a codegen-time local variable name; it isn't wire data and is allocated by the consumer when emitting JS.

### Binary serialization — function-params router conveniences

Mion's binary spec carries two features that the JSON family doesn't need and that we have intentionally **not** ported:

| Feature                          | What it does                                                                                                                                                                                                                               | Mion location                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| All function params are optional | Every top-level tuple slot becomes optional at the binary protocol level — a caller can transmit `['hello', undefined, undefined]` for a `(a, b, c)` function and the receiver decodes the bits that are set. Enables partial-payload RPC. | `mion/packages/run-types/src/rtCompilers/binary/binarySpec/13BinaryAllParamsOptional.spec.ts` (10 cases), driven by `rt.createRTParamsFunction(toBinary)` / `createSerializationParamsFn` in `binaryHelpers.ts`. |
| `paramsSlice`                    | Skips the leading N params of a function tuple before serialising. Used by mion's router to strip an injected context arg (`(ctx, a, b)` → wire shape only `(a, b)`).                                                                      | Same file, plus the `slice function params` test in `06BinaryFunctions.spec.ts`. Mion exposes this via the 2nd argument of `createSerializationParamsFn(rt, sliceStart)`.                                          |

Both are router-layer conveniences, not generic type-system features. ts-go-run-types is the latter, so neither has a use case in the current public API surface.

**Why we don't re-introduce `SubKindParams` to the protocol to support these:**

Every other RT generator (`isType`, `getTypeErrors`, `prepareForJson`, `restoreFromJson`, `stringifyJson`, `prepareForJsonSafe`, `prepareForJsonSafePreserve`, `hasUnknownKeys`, `stripUnknownKeys`, `unknownKeyErrors`, `unknownKeysToUndefined`, `unknownKeysToUndefinedWire`) consumes function parameters via the TS-native `Parameters<typeof fn>` slice — which lowers to a plain tuple at the type-checker layer. None of them carry or read a "this tuple is function params" marker. Adding `SubKindParams` for `toBinary` / `fromBinary` alone would force every other family to either ignore it (wasted protocol bytes) or branch on it (asymmetric code paths across the RT family). Both are worse than the current uniformity, which is: **`Parameters<typeof fn>` is a tuple, period; binary handles it like any other tuple**.

**Migration path if we ever need these features:**

Surface them as caller-driven options on the binary entry points, not as protocol-level type variants:

```ts
createBinaryEncoder<T>(val?, options?: {allOptional?: boolean; sliceStart?: number}, id?)
createBinaryDecoder<T>(val?, options?: {allOptional?: boolean; sliceStart?: number}, id?)
```

The Go-side wiring already supports the `allOptional` half — `emitTupleToBinary` in `internal/compiled/typefns/binary_to.go` reads an `isFnParams` flag and uses `isFnParams || resolved.Optional` to decide the bitmap slot for each member. The flag is currently hardcoded to `false`; lifting it to a per-request option that the encoder factory threads through is the cleanest path. `sliceStart` is similar — start the bitmap loop at the supplied offset and skip the leading children at compile time.

The corresponding 10 `13BinaryAllParamsOptional` tests + the `slice function params` test become a new `test/adapters/binaryParams.test.ts` file (small enough to hand-write — they're all variations on the same idea, no shared suite needed) once the API is in place.

---

## Compiler / resolver features not yet shipped

- **Pre-process build mode** (`ts-go-run-types build --out .runtypes/`) for bundler-agnostic integration (Bun, SWC, plain tsgo). The binary already supports `--out-json` / `--out-ts`; the missing piece is a one-shot CLI subcommand that walks a project's source files itself instead of relying on the plugin to drive `scanFiles`.
- **esbuild / Rollup / Webpack / Babel adapter plugins**. Each is ~100–150 LOC reusing `rewrite.ts`. Plugin pattern is the same; defer until there's user demand.
- **Vendored shim** (drop the tsgolint submodule entirely, regenerate the shim ourselves via `tools/gen_shims`). Cleaner `git clone && go build`. Do once the API shape stabilises.
- **Source-map adjustments** when the rewriter injects site-id arguments. Negligible effect for human debugging at the current stage.
- **Production-grade call-site scanner** — replace the regex in `rewrite.ts` with `es-module-lexer` or `ts.createSourceFile` for fewer false positives inside strings/comments.
- **HMR-aware incremental resolver** — the daemon currently runs the full Program for the lifetime of the build; a real HMR story requires `updateSourceFile` and incremental rebinding.
- **Concurrency**: the `runtype` serializer in `internal/compiled/runtype/serialize.go` is single-threaded by design; the resolver holds one checker. Multi-checker fan-out (one per CPU, like tsgolint's linter) is a later concern.

---

## Open questions parked for later

- **Value-first format/constraint definitions** (`define({...})` + `Infer<>` alongside the type-first `FormatString<…>`): a value-first authoring surface — a discriminator-keyed config (`{type: 'string', maxLength: 50}`) the type is derived from, coexisting with today's type reflection over one shared engine. Motivated by adoption (Zod's value-first DX vs Deepkit's type-first), runtime interop (Drizzle/forms/OpenAPI reading the config as plain data), and the fact that the Go binary — not the type system — is the engine, so a second front-end is a thin adapter. Full write-up of the architecture, the discriminator-as-mapping-not-inference insight, the type-vs-config-AST fork, and the params-cache de-dup: [value-first-formats.md](./value-first-formats.md).
- **Recursive type aliases** (`type List = { head: number; tail: List | null }`): the id-table dedup handles them at the data layer, the `.ts` artifact's footer re-knots cycles. Need an explicit fixture (F18) to lock behaviour in.
- **Conditional and mapped types**: tsgo resolves these to concrete types at the call site; we emit the resolved form. We _lose_ the original conditional/mapped expression. If runtypes ever needs the unresolved form, record it in `flags` as a string snapshot of the source text.
- **Unions of literals vs widened primitive**: tsgo aggressively widens (`"a" | "b"` becomes `string` in many contexts). Document any divergence from parser-level behaviour as fixtures surface it.
- **Generic type parameters at the declaration site** (vs at the use site): `TypeTypeParameter` represents `<T>` _unbound_. We always operate on resolved instantiations. If a consumer needs the unbound form, expose `resolveDeclaration` as a separate op.
- **`createIsType` / `createGetTypeErrors` return type and naming**: today these silently drop non-serialisable members (functions, methods, symbols, symbol-keyed properties) from the validated shape and emit a Warning. Users sometimes expect the validator to enforce the full TS type. Two future directions worth discussing before changing — current callers depend on the existing silent-drop semantics:
  - **Refine the return type to `IsTypeFn<DataOnly<T>>`** where `DataOnly<T>` is a TS-level mapped type that strips non-serialisable members. The validator's signature would then state the truthful guarantee: "this function validates the serializable projection of `T`, not `T` itself." Caller-side IDE feedback improves with no runtime change.
  - **Rename `createIsType` → `createIsDataType`** (mion-style explicit naming). Optionally also introduce a stricter `createIsFullType` that errors instead of dropping for non-serialisable members. The two functions cover the two use cases: validating wire data (current behaviour, renamed for clarity) vs asserting a full TS type at a boundary that owns the values (new).
  - See [CLAUDE.md](../CLAUDE.md) "isType contract" for the current semantic.

---

## Conventions for adding to this file

- **A row in "Known gaps"** should always include a concrete approach. If we can't think of one, escalate to "Compiler / resolver features not yet shipped" or "Open questions".
- **A row in "Compile-time only — what we will never capture"** is a permanent design decision, not a deferral. Don't promote out of it without a redesign discussion.
- **Implemented work** belongs in the status snapshot, not in a pending list — prune as you ship.
