# Roadmap

Living document. Captures **what's implemented**, **what's deliberately out of scope** (and why), and **open questions parked for later**.

---

## Status snapshot

| Component                         | Status            | Notes                                                                          |
| --------------------------------- | ----------------- | ------------------------------------------------------------------------------ |
| Go resolver + checker integration | ✅                | `scanFiles` + `dump` ops over stdio (`--one-shot`) and Unix socket (`--daemon`) |
| Reflection-shape projection       | ✅                | `*checker.Type` → `protocol.Type` discriminated union, dedup by structural id  |
| Wire formats                      | ✅                | JSON dump + self-wired TS module (`--out-json` / `--out-ts`)                   |
| Vite plugin                       | ✅                | byte-offset rewriter, `virtual:runtypes-cache` module                          |
| Go fixture tests                  | ✅                | F1–F30 + atomic / object / circular kinds                                      |
| Vite plugin tests                 | ✅                | rewrite, atomic, wrapping suites — 201/201                                     |
| `isType` JIT emit                 | ✅                | every mion node category ported; 139 active validation cases, see below        |
| `templateLiteral` projection+emit | ✅                | regex-compile at JIT-build time; also wired into index-signature key patterns  |
| Native containers (Map/Set/Promise) | ✅              | `instanceof` + iteration over `.entries()` / `.values()`; thenable check       |
| Docs                              | ✅                | ARCHITECTURE.md "Reflection shape" section                                     |
| Decorators / `TypeNumberBrand`    | ❌ pending        | needs an AST-level scanner — see below                                         |
| `infer` kind                      | ❌ pending        | reserved in the enum, only meaningful inside unresolved conditional types     |
| Pre-process build mode            | ❌ pending        | bundler-agnostic CLI that writes the cache without Vite                        |
| Serializer circular-detection     | ❌ pending        | jitfn currently treats every compound as non-inlined as a safer default        |

---

## Compile-time only — what we will never capture

`ts-go-run-types` is a **compile-time, structural** reflection system. The cache is a JSON-shaped graph of `Type` nodes; the only legitimate runtime-valued payload it carries is **literal data** (numbers, strings, booleans, null, undefined, bigints, regexps, symbols-by-description). Every other field that exists in the mion runtypes runtime model but only has meaning as a *live JS value* is **deliberately not captured**, and there is no plan to add it.

This is a design choice, not a missing feature: structural type checking only needs the shape, and binding the cache to live JS values would re-introduce the bundler/tooling coupling we left tsc to escape.

| Runtime-only field                     | Why we won't emit it                                                                                                                                                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TypeFunction.function?: Function`     | The closure is a JS value. Structural validation needs the signature (parameters + return), which we already emit. If a consumer needs to *call* the function, they import it.      |
| `TypeClass.classType: ClassType`       | The constructor reference is a JS value. We emit the structural shape (`types`, `extendsArguments`, `implements`) and `classRef` provenance for builtins (`Date`/`Map`/`Set`/`RegExp` resolved to `globalThis.<Name>` in the `.ts` footer). User-class constructor wiring is **not** planned. |
| `TypeEnum.enum: object`                | Enum object identity is a JS value. We emit `values` (and would emit a synthetic `{[name]: value}` for const enums if needed) — sufficient for structural checks.                   |
| `default?: () => any` (param/property) | Default *expressions* are arbitrary JS. Literal defaults (`5`, `"foo"`, `true`, `null`) are inlined; non-literal defaults are dropped with `flags: ["nonLiteralDefault"]`.          |
| `JitContainer`                         | Consumer-side JIT cache. Populated lazily by the runtypes runtime on first use.                                                                                                     |
| `TypeInfer.set(type)`                  | Runtime mutation hook for unresolved conditional types. The checker has already resolved them by the time we project, so consumers never see an unresolved `infer T`.               |

### Literal regexps — the one transform

JSON cannot carry a `RegExp` instance, but the *literal* `RegExp` is compile-time-known data (source + flags). The serializer encodes it as `{regexp: {source, flags}}` in JSON; the generated `.ts` artifact's footer rehydrates it via `t.literal = new RegExp(source, flags)`. Same pattern as `bigint` (string + `BigInt(...)`) and `symbol` (description + `Symbol(...)`). Consumers reading the JSON directly get the structured form.

---

## Known gaps with planned workarounds

These are real reflection features we intend to ship; each has a concrete approach.

### Reflection features that need AST-level scanning beyond tsgo's checker

| Feature                                      | Where it lives                                                     | Approach                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Decorators (`MinLength<5>`, `Email`, etc.)   | Comment-pragma or branded type aliases parsed by a TS transformer. | Implement a decorator scanner that walks the type's declaration AST and recognises the marker types. Same primitive — `node.ForEachChild` — we already use. |
| `TypeNumberBrand` (integer / int32 / …)      | Decorator-driven; same path as above.                              | Ship alongside the decorator scanner.                                                                                                                       |
| `inlined: true` flag                         | Set when a type is inlined rather than referenced by name.         | Derive from "did we have an alias symbol?" — emit `inlined: true` for anonymous types. Field is already in the protocol, just not populated.                |
| `originTypes: { typeName, typeArguments }[]` | Tracks each layer of type-alias unwrapping.                        | Walk the alias chain in tsgo (each alias has a target). Add when needed — not blocking for the runtypes JIT.                                                |
| `indexAccessOrigin`                          | Provenance for `T["key"]` resolved types.                          | tsgo's `IndexedAccessType` has the container + index types. Emit when we hit `TypeFlagsIndexedAccess`.                                                      |

### `isType` emit — port complete

Every mion `isType` node category is ported with end-to-end test coverage: **all active validation cases passing, 0 deferred** in `packages/ts-go-run-types/test/adapters/isType.test.ts` (one `describe(...)` block per category, each with its own drift-guard counter).

| Category | `describe` block | Highlights |
| --- | --- | --- |
| Atomic (any/unknown/never/void/null/undefined/string/number/boolean/bigint/symbol/object/regexp/literal/enum/Date) | `isType / ATOMIC` | Includes `noLiterals` option variants. |
| Array | `isType / ARRAY` | Circular self-reference, 2D / 3D, `noIsArrayCheck`, array-of-objects, array-of-unions, array-of-tuples, `symbol[]` non-serializable. |
| Object (interface / class / property / method / index signature / call signature / function) | `isType / OBJECT` | Plain user class with `prototype`-filter, RpcError-shape, all-optional w/ `allOptionalCode` guard, callable interface (`isCallable()` branch), `Parameters<F>` for CallSignature param validation, `Record<UnionKey, V>`. |
| Tuple | `isType / TUPLE` | Optional members, rest (`[A, ...B[]]`), circular self-reference, non-serializable function slot, trailing-optionals chain, named tuple labels. |
| Union | `isType / UNION` | Union-of-objects, discriminated unions, union with methods, circular unions, intersection (resolved to ObjectLiteral by tsgo). |
| TemplateLiteral | `isType / TEMPLATE_LITERAL` | Regex-escape edge cases, multi-segment URLs, nested-in-object, index-signature key pattern, union-placeholder. |
| Native | `isType / NATIVE` | `Map<K, V>` (`instanceof` + `.entries()`), `Set<T>` (`.values()`), `Promise<T>` (thenable), `Awaited<P>`. |
| Utility | `isType / UTILITY` | `Partial` / `Required` / `Pick` / `Omit` / `Exclude` (atomic + object-union) / `Extract` / `NonNullable` / `ReturnType` / `Readonly` + intersection-with-required-override + Omit-keeping-optional. tsgo resolves utilities eagerly so no new emit needed — pure regression coverage. |

The validation suite's `as const satisfies` type guard catches drift between the suite and the adapter `describe` blocks. Each block's "all cases ran" counter test catches forgotten `it()` registrations.

**Renderer-side architecture**: composite emits propagate a `CodeNS` sentinel from any unsupported leaf upward through the existing compile pass; the renderer's dangling-dep cascade then drops any entry whose recorded deps weren't emitted. Replaces an earlier O(M·S) `subtreeFullySupported` pre-walk; runtime behavior is unchanged (unsupported types silently absent, createIsType-side noop fallback `() => true` handles the cache miss). See `internal/caches/jitfn/codetype.go` → `CodeNS` for the full contract.

**Out of scope for `isType`** (and tracked separately, will live in the validation-constraints library):
- Number brand types (`int` / `uint8` / `Range<a, b>` / …)
- String-mapping constraint forms (`Uppercase<string>` as a generic constraint; the literal-collapsed forms work today via the standard literal-equality check)

### Reflection Type variants not yet projected

- `infer` (kind 34) — `infer T` placeholder. Only meaningful inside unresolved conditional types, which tsgo eagerly resolves; would only appear if we add an op that returns the unresolved form.
- `rest` (kind 29) outside tuples — function rest parameters. Currently marked with a `flags` entry; the dedicated `rest` Type variant comes later.
- `enumMember` (kind 28) standalone — we emit `enum.values` but not per-member `TypeEnumMember` nodes. Add when needed.

### JSON shape — known limitations and how we handle them

| Limitation                  | Cause                                 | Handling                                                                                                                                                                                       |
| --------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cyclic types in raw JSON    | JSON has no cycle support.            | Refs are sentinels (`{kind: -1, id: "<hash>"}`) in JSON; the generated `.ts` artifact resolves cycles via direct `const` assignment in the footer. JSON-only consumers walk the table to re-knot. |
| `parent` back-references    | Same — JSON has no cycles.            | Not emitted at all. Canonical nodes are shared singletons (one per structural id) so a stored `parent` would be wrong for any node with multiple parents. Consumers that need a parent link build it themselves while walking the graph from a known root.                          |
| Symbol-keyed property names | JSON has no symbol type.              | Emit synthetic `@@<name>` strings + `flags: ["symbol"]`. Round-tripping symbol *identity* would require a runtime symbol registry — out of scope.                                              |
| `bigint` literal values     | JSON numbers lose precision past 2⁵³. | Emit as a string with `flags: ["bigint"]`; the `.ts` footer re-hydrates with `BigInt(...)`. JSON consumers do the same.                                                                        |
| `regexp` literal values     | JSON has no `RegExp` type.            | Emit `{regexp: {source, flags}}`; the `.ts` footer re-hydrates with `new RegExp(source, flags)`. JSON consumers do the same.                                                                   |
| `symbol` literal values     | JSON has no symbol type.              | Emit description string; the `.ts` footer re-hydrates with `Symbol(desc)`. Identity is not preserved — same caveat as symbol-keyed names.                                                      |

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

Rationale: the wire format leans on dedup/minimality elsewhere; carrying `unionItem` / `unionIndex` / `typeID` directly would duplicate data already on the wire (`safeUnionChildren[i]`, the index itself, and the property's child ref id respectively). The detection passes (shared-name + unique-prop fallback) live on the Go side (`internal/serialize/union_safeorder.go`); both write into this single slot, scoped to the parent union — a property node shared between two unions is independently classified for each parent.

`compiledName` in mion's struct is a codegen-time local variable name; it isn't wire data and is allocated by the consumer when emitting JS.

---

## Compiler / resolver features not yet shipped

- **Pre-process build mode** (`ts-go-run-types build --out .runtypes/`) for bundler-agnostic integration (Bun, SWC, plain tsgo). The binary already supports `--out-json` / `--out-ts`; the missing piece is a one-shot CLI subcommand that walks a project's source files itself instead of relying on the plugin to drive `scanFiles`.
- **esbuild / Rollup / Webpack / Babel adapter plugins**. Each is ~100–150 LOC reusing `rewrite.ts`. Plugin pattern is the same; defer until there's user demand.
- **Vendored shim** (drop the tsgolint submodule entirely, regenerate the shim ourselves via `tools/gen_shims`). Cleaner `git clone && go build`. Do once the API shape stabilises.
- **Source-map adjustments** when the rewriter injects site-id arguments. Negligible effect for human debugging at the current stage.
- **Production-grade call-site scanner** — replace the regex in `rewrite.ts` with `es-module-lexer` or `ts.createSourceFile` for fewer false positives inside strings/comments.
- **HMR-aware incremental resolver** — the daemon currently runs the full Program for the lifetime of the build; a real HMR story requires `updateSourceFile` and incremental rebinding.
- **Concurrency**: `serialize.Cache` is single-threaded by design; the resolver holds one checker. Multi-checker fan-out (one per CPU, like tsgolint's linter) is a later concern.

---

## Open questions parked for later

- **Recursive type aliases** (`type List = { head: number; tail: List | null }`): the id-table dedup handles them at the data layer, the `.ts` artifact's footer re-knots cycles. Need an explicit fixture (F18) to lock behaviour in.
- **Conditional and mapped types**: tsgo resolves these to concrete types at the call site; we emit the resolved form. We _lose_ the original conditional/mapped expression. If runtypes ever needs the unresolved form, record it in `flags` as a string snapshot of the source text.
- **Unions of literals vs widened primitive**: tsgo aggressively widens (`"a" | "b"` becomes `string` in many contexts). Document any divergence from parser-level behaviour as fixtures surface it.
- **Generic type parameters at the declaration site** (vs at the use site): `TypeTypeParameter` represents `<T>` _unbound_. We always operate on resolved instantiations. If a consumer needs the unbound form, expose `resolveDeclaration` as a separate op.

---

## Conventions for adding to this file

- **A row in "Known gaps"** should always include a concrete approach. If we can't think of one, escalate to "Compiler / resolver features not yet shipped" or "Open questions".
- **A row in "Compile-time only — what we will never capture"** is a permanent design decision, not a deferral. Don't promote out of it without a redesign discussion.
- **Implemented work** belongs in the status snapshot, not in a pending list — prune as you ship.
