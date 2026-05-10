# Roadmap

Living document. Captures **pending implementation steps** for the in-progress deepkit-shape migration, **known gaps and workarounds** for later releases, and **explicit out-of-scope items** for v1 so we don't accidentally scope-creep.

Last updated alongside the deepkit-shape migration (v0.2 work in progress on branch `claude/investigate-tsgolint-transformer-3W2tm`).

---

## Status snapshot

| Component | v0.1 (POC, shipped) | v0.2 deepkit-shape (in progress) |
|-----------|----------|----------|
| Go resolver + checker integration | ✅ | ✅ (no API change) |
| Per-type projection | ✅ ad-hoc shape | ⏳ rewriting to deepkit `Type` |
| Wire format | ✅ JSON only | ⏳ JSON + generated `.ts` artifact |
| Vite plugin | ✅ | ⏳ shape-mirroring update |
| Go fixture tests | ✅ 9 tests | ⏳ rewrite + add F12–F16 |
| Vite plugin tests | ✅ 4 tests | ⏳ rewrite + add F17 |
| Docs | ✅ ARCHITECTURE.md | ⏳ deepkit compat section |

---

## Pending steps for v0.2 (deepkit shape)

In execution order. Tracked in the live todo list during implementation.

1. **`internal/protocol/protocol.go`** — replace `TypeNode` with `Type` + `ReflectionKind` constants matching deepkit's enum order, add `KindRef` sentinel and `NewRef(id)` helper.
2. **`internal/serialize/serialize.go`** — rewrite `projectType` to emit deepkit shape; split objects into `class` / `objectLiteral` / `array` / `tuple` / `promise` / `function` based on `ObjectFlags` + symbol detection; emit `types: []` arrays of `propertySignature` / `methodSignature` / `indexSignature` / `callSignature`; wrap params as `parameter` Type nodes.
3. **`internal/emit/json.go`** *(new)* — pure JSON dump of the cache (refs as `{kind:-1,id:N}` sentinels).
4. **`internal/emit/tsmodule.go`** *(new)* — emit the runtime `.ts` artifact: `const t<N>` declarations + footer that knots refs and `parent` by direct assignment so consumers `import { __runtypes }` and `__runtypes.get(id)` returns a fully-formed deepkit `Type`. Stable ordering to keep diffs minimal.
5. **`cmd/ts-run-types/main.go`** — add `--out-json PATH` and `--out-ts PATH` flags so the binary writes the cache directly without needing the Vite plugin.
6. **`internal/resolver/resolver_test.go`** — update assertions to walk the deepkit shape; existing F1–F8 must keep passing.
7. **New fixtures + tests**:
   - F12 array (`const xs: string[]`)
   - F13 tuple (`const t: [number, string?]`)
   - F14 promise (`Promise<number>`)
   - F15 class (`class User { id: number; greet(): void {} }`)
   - F16 index signature (`interface M { [k: string]: number }`)
8. **`internal/testfixtures/golden/`** — per-fixture golden `*.json` and `*.ts` snapshot diffs.
9. **`packages/vite-plugin-runtypes/src/protocol.ts`** — mirror the new Go shape (`ReflectionKind` enum + `Type` discriminated union + `TypeRef`).
10. **`packages/vite-plugin-runtypes/src/index.ts`** — virtual cache module emits the same `.ts` artifact shape (or defers to the Go binary's `--out-ts` output in build mode).
11. **`packages/vite-plugin-runtypes/test/`** — update assertions; add F17 (import the generated `.ts` module, assert `__runtypes.get(<id>)` returns a deepkit `Type` with parent links and ref cycles wired).
12. **`docs/ARCHITECTURE.md`** — add "Deepkit shape compatibility" section linking to deepkit/type, documenting lossy mappings and the two output formats.
13. **`examples/03-inference-router/expected-cache.{json,ts}`** *(new)* — golden output for eyeball verification.
14. **Commit + push** to `claude/investigate-tsgolint-transformer-3W2tm`.

---

## Known gaps and workarounds (revisit list — post v0.2)

Anything below is a **deliberate v0.2 omission** with a proposed workaround for a future release. Nothing is silently dropped — every entry has a note for "what to do later".

### Runtime-only deepkit fields (compile-time has no equivalent — must reference, not capture)

| Deepkit field | Why it can't be captured at build time | Workaround for v0.3+ |
|---|---|---|
| `TypeFunction.function?: Function` | Value is the JS function object itself. Compile-time only knows the *declaration*, not the closure. | Emit a lazy back-ref. The generated `.ts` module already lives next to the source; `import { fn } from "./module"` and assign `t.function = fn` in the footer. Requires per-id "origin file + export name" tracking in the resolver. |
| `TypeClass.classType: ClassType` | Same — deepkit stores the actual constructor reference. | Same lazy-import strategy. Track the symbol's `ValueDeclaration` file + export name and emit the import. The `protocol.ClassRef` field is already reserved for this. |
| `TypeEnum.enum: object` | Enum object identity. We have the values, not the runtime object. | Same lazy-import strategy when the enum is exported. For const enums (no runtime object), emit a synthetic `{[name]: value}` literal — equivalent for consumers. |
| `default?: () => any` (param/property) | Default expressions can be arbitrary JS (`() => fetchUser()`). | Emit literal defaults inline (`5`, `"foo"`, `true`, `null`). Anything else: omit and add `flags: ["nonLiteralDefault"]` so consumers know it existed. |
| `JitContainer` | Runtime-only cache for deepkit's JIT. | Don't emit. Consumer's JIT populates it on first use. |
| `TypeInfer.set(type)` | Runtime mutation hook used inside conditional-type evaluation. | Don't emit. We resolve conditionals at compile time, so the consumer never sees an unresolved `infer T`. |

### Deepkit features that need AST-level scanning beyond tsgo's checker

| Feature | Where it lives in deepkit | Workaround for v0.3+ |
|---|---|---|
| Decorators (`MinLength<5>`, `Email`, etc.) | Comment-pragma or branded type aliases parsed by deepkit's TS transformer. | Implement a deepkit-decorator scanner that walks the type's declaration AST and recognises deepkit's marker types. Same primitive — `node.ForEachChild` — we already use. |
| `TypeNumberBrand` (integer / int32 / …) | Decorator-driven; same path as above. | Ship alongside the decorator scanner. |
| `inlined: true` flag | Set when a type is inlined rather than referenced by name. | Derive from "did we have an alias symbol?" — emit `inlined: true` for anonymous types. Cheap to add, just under-tested. |
| `originTypes: { typeName, typeArguments }[]` | Tracks each layer of type-alias unwrapping. | Walk `Type_alias` chain in tsgo (each alias has a target). Add when needed — not blocking for the runtypes JIT. |
| `indexAccessOrigin` | Provenance for `T["key"]` resolved types. | tsgo's `IndexedAccessType` has the container + index types. Emit when we hit `TypeFlagsIndexedAccess`. |

### JSON shape limitations

| Limitation | Cause | Workaround |
|---|---|---|
| Cyclic types in raw JSON | JSON has no cycle support. | Refs are sentinels (`{kind: -1, id: N}`) in JSON; the generated `.ts` artifact resolves cycles via direct `const` assignment in the footer. JSON-only consumers walk the table to re-knot. |
| Symbol-keyed property names | JSON has no symbol type. | Emit synthetic `@@<name>` strings + `flags: ["symbol"]`. Round-tripping symbol identity requires a runtime symbol registry — not on the roadmap. |
| `bigint` literal values | JSON numbers lose precision past 2⁵³. | Emit as a string with `flags: ["bigint"]`; consumer parses with `BigInt(...)`. |

---

## Out of scope for v0.2

Listed here so we have a single record of conscious deferrals.

### Deepkit Type variants not implemented in v0.2

- `templateLiteral` (kind 14) — `` `prefix-${string}` `` template literal types. tsgo exposes via `TypeFlagsTemplateLiteral`, but parsing the placeholder substructure into deepkit's `(TypeString | TypeAny | TypeNumber | TypeLiteral | TypeInfer)[]` shape is non-trivial. Defer.
- `regexp` (kind 12) — `RegExp` as a structural type. Detected via symbol name, easy to add but not used by the runtypes JIT today.
- `infer` (kind 31) — `infer T` placeholder. Only meaningful inside unresolved conditional types, which tsgo eagerly resolves.
- `rest` (kind 33) outside tuples — function rest parameters. We mark rest params with a Flags marker; deepkit-spec rest type variant comes later.
- `enumMember` (kind 27) standalone — we emit `enum.values` but not per-member `TypeEnumMember` nodes. Add when needed.

### Compiler / resolver features not in v0.2

- **Pre-process build mode** (`ts-run-types build --out .runtypes/`) for bundler-agnostic integration (Bun, SWC, plain tsgo). Captured in the previous roadmap conversation; not part of this migration.
- **esbuild / Rollup / Webpack / Babel adapter plugins**. Each is ~100–150 LOC reusing `rewrite.ts`. Plugin pattern is the same; defer until there's user demand.
- **Vendored shim** (drop the tsgolint submodule entirely, regenerate the shim ourselves via `tools/gen_shims`). Cleaner `git clone && go build`. Do once the API shape stabilises.
- **Source-map adjustments** when the rewriter injects site-id arguments. Negligible effect for human debugging at the POC level.
- **Production-grade call-site scanner** — replace the regex in `rewrite.ts` with `es-module-lexer` or `ts.createSourceFile` for fewer false positives inside strings/comments.
- **HMR-aware incremental resolver** — currently the daemon runs the full Program for the lifetime of the build; a real HMR story requires `updateSourceFile` and incremental rebinding.
- **Concurrency**: `serialize.Cache` is single-threaded by design; the resolver holds one checker. Multi-checker fan-out (one per CPU, like tsgolint's linter) is a v0.3+ concern.

### Open questions parked for v0.3+

- **Recursive type aliases** (`type List = { head: number; tail: List | null }`): the id-table dedup handles them at the data layer, the `.ts` artifact's footer re-knots cycles. Need an explicit fixture (F18) to lock behaviour in.
- **Conditional and mapped types**: tsgo resolves these to concrete types at the call site; we emit the resolved form. We *lose* the original conditional/mapped expression. If runtypes ever needs the unresolved form, record it in `flags` as a string snapshot of the source text.
- **Unions of literals vs widened primitive**: tsgo aggressively widens (`"a" | "b"` becomes `string` in many contexts). Document any divergence from deepkit's parser-level behaviour as fixtures surface it.
- **Generic type parameters at the declaration site** (vs at the use site): deepkit's `TypeTypeParameter` represents `<T>` *unbound*. We always operate on resolved instantiations. If runtypes JIT needs the unbound form, expose `resolveDeclaration` as a separate op.
- **Runtime symbol registry**: would let symbol-keyed properties round-trip identity. Requires a coordinated runtime + build-time scheme; nobody asks for this yet.

---

## Conventions for adding to this file

- **A row in "Known gaps"** should always include a workaround. If we can't think of one, escalate to "Out of scope" or ask the user.
- **A row in "Out of scope"** is a v0.2 deferral, not a permanent rejection. Promote to "Known gaps" once we have a concrete workaround proposal.
- **Promote to "Pending steps"** only when the design is settled and ready to execute.
