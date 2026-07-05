# Unsupported kinds — how the throw architecture works

> _Resurfaced historical doc, kept as a record of implemented work. Project names have changed since: `ts-go-run-types` / `@mionjs/ts-go-run-types` is now `ts-runtypes`, the `vite-plugin-runtypes` plugin is now `runtypes-devtools`, and `reflectRunTypeId(value)` is now `getRunTypeId(value)`. The runtime `diagnosticCatalog.ts` referenced below was since removed (see [diagnostic-catalog-dedup.md](diagnostic-catalog-dedup.md)). Some other paths and symbols may since have been renamed, removed, or ported to Go._

This document explains how ts-go-run-types handles TypeScript types that the RT compiler cannot faithfully validate, serialise, or deserialise. It's the reference both for library users wondering why their `interface User { sym: symbol }` doesn't validate `sym`, and for contributors adding a new unsupported kind or a new emitter family.

## Problem

TypeScript types can describe runtime values the RT compiler cannot faithfully validate, serialise, or deserialise. Examples:

- `Promise<T>` — asynchronous; the RT can't sample the resolved value synchronously
- `symbol` — carries runtime identity that does not survive JSON or compare equal across realms
- `Function` / `() => T` — has no value form to encode
- `never` — has no inhabitants
- `WeakMap` / `WeakSet` — no enumerable contents
- Future kinds with no emit yet

Rather than silently producing a half-working factory (or worse, a lossy one that round-trips to a different value), ts-go-run-types classifies these kinds as **unsupported** and gives the user a clear, build-time-visible signal about it. The same mechanism powers both the runtime throw and the build-time diagnostic, so users see the problem the moment they wire up a marker call.

## The two-rule model

The pipeline applies exactly two rules:

1. **Property / PropertySignature children that are unsupported are dropped silently from the parent's emit**, with a build-time **Warning**-severity diagnostic naming the dropped member. The rest of the object's validator / serializer continues to work. This is **by design** — dropping a `() => void` property from an `validate` validator matches what JSON already does on the wire, so the validator's "shape" is the data-only projection of the type. See [CLAUDE.md](../CLAUDE.md) "validate contract — serializable data only" for the semantic guarantee.
2. **Everywhere else** (root, array element, tuple slot, union member, function param / return, Map key / value, Set member, index signature value, intersection) **propagates upward to the root, where the factory is rendered as an `alwaysThrow` entry**. Calling `createXxx<T>()` for that T throws at the call site with a code like `[PJ001] Never type cannot be encoded to JSON. (at src/foo.ts:7:18)`. The runtime error includes the **first known marker call site** so the user can jump straight to the offending source even if they didn't see the build-time error.

This mirrors mion's `getRTChildren` filter — the only "skip" in the upstream library is property-level absorption; everything else throws.

**Severity contract**:

- Property drops emit at **Warning** — surfaced via `this.warn()` in the Vite plugin's build log + IDE Problems panel. Does not halt the build.
- Root-position / array-element / other propagating throws emit at **Error** — surfaced via `this.warn()` for visibility, AND `this.error()` once at the end of the diagnostic pass so the build **halts**. HMR is more lenient (warning only) so dev sessions survive in-progress edits.

**These diagnostics fan out per _demanded_ `(family, type)` pair, not per interned type.** Now that the function caches are demand-driven (each `createX` site carries structured demand — `protocol.Site.Demand` — alongside its injected `[typeId, fnHash]` tuple via the `InjectTypeFnArgs<T, Fn>` marker; see [CLAUDE.md](../CLAUDE.md) → "Two injection markers"), a family's unsupported-kind diagnostics are only computed for the types that family's own call sites request. A type reached **only** via `getRunTypeId` / `reflectRunTypeId` (pure reflection, never validated or serialized) triggers **no** function-family diagnostics at all — reflection keeps the unsupported node (see the `notSupported` flag below) without ever rendering an emitter for it. This is a correctness improvement: no more spurious build-halting **Error** diagnostics for types that are merely reflected. The `it` family is the cross-family exception (union decoders + `validationErrors` reference `val_<member>`), so its demand — and thus its diagnostics — also covers the `val_` members other demanded families pull in.

## Why these rules

- **Properties are non-positional and optional-tolerant**: a JSON object can lack a key without breaking shape. Dropping `onClick` from `User` leaves a valid `User` JSON document. The structural type just becomes lossy at that slot — which is acceptable since the slot's type was un-encodable to begin with.
- **Arrays, tuples, maps, sets, function signatures are positional or sequential**: dropping an element changes length or breaks shape. The only sound options are throw or lossy padding (`null` placeholders that the decoder can't distinguish from real null entries); throw preserves user intent — the user asked for a serialiser; they get one, and they get told it can't work for this shape.
- **Root has nothing to absorb up to** — throw is the only option.

## The unsupported set

| Kind                                                                        | Why                                                                | Code family                  |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------- |
| `KindNever`                                                                 | No inhabitants                                                     | `XX001`                      |
| `KindClass` + SubKindNonSerializable                                        | Non-serialisable (WeakMap, Int8Array, …)                           | `XX002`                      |
| `KindPromise`                                                               | Async — can't sample synchronously                                 | `XX002`                      |
| `KindFunction` / `KindMethod` / `KindMethodSignature` / `KindCallSignature` | No serialisable value form                                         | `XX003`                      |
| `KindSymbol`                                                                | Runtime identity not round-trippable; not comparable across realms | `XX005`                      |
| Future kinds without an emit                                                | Walker falls through                                               | (unregistered → silent skip) |

> **`KindPromise` is validation-supported — the one exception in this table.** `validate` / `getValidationErrors` (`IT` / `TE`) do **not** throw on `Promise<T>`; they validate it structurally as a thenable (`typeof v === 'object' && v !== null && typeof v.then === 'function'`) because a Promise is a real runtime value with a checkable shape (a caller who wants the resolved value uses `Awaited<P>`, which tsgo resolves to `T`). Only the **serialization** families (`PJ` / `PJS` / `PJP` / `RJ` / `SJ` / `TB` / `FB`) treat `Promise` as unsupported and throw, because the async value can't be sampled synchronously. `KindSymbol` and `KindFunction`/`KindMethod` remain unsupported for **all** families including validation.

`XX` is the per-family prefix. Each RT function family has its own:

- `PJ` — prepareForJson
- `PJS` — prepareForJsonSafe
- `PJP` — prepareForJsonSafePreserve
- `RJ` — restoreFromJson
- `SJ` — stringifyJson
- `TB` — toBinary
- `FB` — fromBinary
- `IT` — validate
- `TE` — validationErrors

So the same logical throw (Never at root) surfaces as `PJ001` under prepareForJson, `SJ001` under stringifyJson, `TB001` under toBinary, etc. Users reading their build log can grep by family prefix.

## Reflection keeps these nodes — the `notSupported` flag

The two rules above govern **emit** (validators / serializers). **Reflection is different**: the serializer KEEPS every unsupported node in the RunType tree so a reflected type stays a complete picture of the source type — nothing is dropped from reflection. At cache-exit, `PopulateFamily` (`internal/protocol/family.go`) sets `NotSupported: true` on exactly the unsupported-set nodes via `IsNotSupportedKind(kind, subKind)` — the same set tabulated above, with **`KindPromise` excluded** (it is validation-supported, i.e. data). The flag is set on the **node itself only, never its children** (a method's params / return are not flagged).

- **Emit is unchanged.** The type functions still drop unsupported children at property positions (Warning) and throw at propagating positions (Error) per the two-rule model. The flag is additive metadata for reflection / tooling; emit ignores it.
- **Wire.** `notSupported` ships as the `notSupported` JSON field on the dump (`omitempty`) and as positional factory-arg **slot 19** in `packages/ts-go-run-types/src/caches/runTypesCache.ts` (mirrored on `RunType` in `src/runtypes/types.ts`). Reflection consumers read it to know which members the validators / serializers skip.

## Wire format

A factory rendered for an unsupported root looks like:

```js
init('pj_<hash>', '<typeName>', undefined, false, undefined, undefined, undefined, 'PJ001', 'src/foo.ts:7:18');
```

The 8th argument is `alwaysThrowCode`. The 9th (optional) is `alwaysThrowSite` — a `file:line:col` string pointing at the **first known marker call site** for the type. The JS-side `init()` consumer constructs a throwing factory from both via `alwaysThrowFactory(code, siteHint)` — see `packages/ts-go-run-types/src/runtypes/diagnosticCatalog.ts`. The error thrown at runtime is:

```
Error: [PJ001] Never type cannot be encoded to JSON. (at src/foo.ts:7:18)
```

The `[code]` prefix lets users grep by code OR by message phrase; the trailing `(at file:line:col)` lets the user jump straight to the offending marker call. When the renderer has no provenance for the type (orphaned cache entry — rare), the 9th arg is `undefined` and the suffix is omitted.

Normal factories use the 7-arg form (`alwaysThrowCode` and `alwaysThrowSite` default to `undefined`); noop factories use a 4-arg form (`isNoop=true`, trailing args omitted). Three init() shapes total:

- **Normal**: `init(hash, typeName, codeBody, false, rtDeps, pureFnDeps, createRTFn)`
- **Noop**: `init(hash, typeName, undefined, true)` — JS side fills in an identity factory
- **AlwaysThrow**: `init(hash, typeName, undefined, false, undefined, undefined, undefined, 'PJ001', 'src/foo.ts:7:18')` — JS side constructs the throwing factory from the code, optionally appending the call-site hint to the thrown error

## How an emit signals "unsupported"

The kind's arm in the emitter's `Emit` switch returns `RTCode{Code: "", Type: CodeNS}`. That's it. No message, no list, no special function:

```go
case protocol.KindNever:
    return RTCode{Code: "", Type: CodeNS}

case protocol.KindSymbol:
    return RTCode{Code: "", Type: CodeNS}
```

The walker latches the leaf RT (`Walker.UnsupportedLeaf`); the renderer derives the per-family code via `Emitter.DiagCodeForLeaf(leaf)`. The emit doesn't know which code or message will surface — that's the renderer's job, driven by the active emitter's family.

## How a parent absorbs

Only `emitProperty*` (and the PropertySignature path) absorbs. The pattern:

```go
childRT := ctx.CompileChild(rt.Child, CodeS)
if childRT.Type == CodeNS {
    leaf := ctx.walker.UnsupportedLeaf
    code := ctx.DiagCodeForLeaf(leaf)
    ctx.EmitDiagnostic(code, "property "+rt.Name+" has unsupported type and is excluded")
    ctx.walker.AbsorbUnsupported()
    return RTCode{Code: "", Type: CodeS}
}
```

`AbsorbUnsupported()` resets the walker latch so sibling properties can also absorb their own `CodeNS` independently. Non-property parents skip the absorb path and propagate `CodeNS` unchanged — the propagation reaches root, the renderer fires the `alwaysThrow` path.

## Adding a new unsupported kind

When a new TypeScript kind lands that the RT can't handle:

1. In each affected emitter's kind switch, ensure the new kind's arm either is absent (falls through to the default `CodeNS`) or explicitly returns `RTCode{Code: "", Type: CodeNS}`.
2. Register per-family codes in `internal/diag/codes_runtype.go` (one per family that has an emit).
3. Add the kind → code mapping to each emitter's `DiagCodeForLeaf` switch in `internal/cachegen/typefunctions/diag_codes.go`.
4. Add the messages to `packages/ts-go-run-types/src/runtypes/diagnosticCatalog.ts`.

No edits to walker, renderer, or skeleton files needed — the pipeline picks it up automatically.

## Adding a new emitter family

When porting a new mion RT function (e.g. `mockType`, a new serialiser):

1. Implement the `Emitter` interface in `internal/cachegen/typefunctions/<family>.go`.
2. Implement `LeafDiagCodeProvider.DiagCodeForLeaf` in `internal/cachegen/typefunctions/diag_codes.go` — one switch over the unsupported kinds returning per-family codes.
3. Add the family's codes in `internal/diag/codes_runtype.go` and `packages/ts-go-run-types/src/runtypes/diagnosticCatalog.ts`.
4. Wire the family's renderer in `internal/resolver/render.go` and `internal/resolver/dispatch.go`.
5. Add a new cache skeleton `.ts` under `packages/ts-go-run-types/src/caches/` (embedded via `src/caches/skeletons.go`) and register a `Skeleton<FnName>` constant in `internal/cachetpl/splice.go`.

The walker, property-absorb mechanism, alwaysThrow renderer, and 8-arg init() shape all work without further changes.

## FAQ

**"Why doesn't my `getRunTypeId<{onClick: () => void}>()` throw any more?"**
Property-level absorption is now the rule. The validator works for the rest of the object; `onClick` drops with an `VL010` / `VL011` diagnostic. To see the diagnostics, build with the Vite plugin and check the Problems panel — or read the Go binary's `Response.Diagnostics` field directly.

**"My symbol-typed property stopped validating!"**
`KindSymbol` was reclassified as unsupported because symbol identity doesn't survive serialisation, and symbol values aren't comparable across realms (or round-trips). A validator asserting "this is a symbol" gives a false sense of safety — the user can't actually round-trip the value, can't transfer it across a worker boundary, can't compare it to a constant. Use a stable string key (or a string-backed enum) instead.

**"What about symbol literals (well-known symbols)?"**
`KindLiteral` with `Flags=['symbol']` (e.g. `type T = typeof Symbol.iterator`) is a separate code path. Well-known symbols remain supported because their identity IS stable across realms.

**"My factory used to throw at creation time; now it throws at call time. Why?"**
The throw used to be wired via an inline `function(utl){throw new Error(...)}` factory that fired the first time the user invoked `createXxx<T>()` — which then called into `materializeRTFn` and the throw bubbled up. With the alwaysThrow wire format, the throw fires the same place (call time, on the user-returned validator), just constructed from a code instead of an embedded function body. The thrown error message gains a `[code]` prefix for grep-ability.

**"Can I localise / override a diagnostic message?"**
Override `packages/ts-go-run-types/src/runtypes/diagnosticCatalog.ts` at build time (e.g. via a Vite plugin alias). The codes are stable; the messages are what gets localised.

**"How do I see all the codes the binary can emit?"**
Read `internal/diag/codes_*.go`. Every code with its family and severity is registered there. Codes are stable strings — once shipped, they don't change.
