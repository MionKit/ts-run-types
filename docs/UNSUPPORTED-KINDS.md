# Unsupported kinds — how the throw architecture works

This document explains how ts-go-run-types handles TypeScript types that the JIT compiler cannot faithfully validate, serialise, or deserialise. It's the reference both for library users wondering why their `interface User { sym: symbol }` doesn't validate `sym`, and for contributors adding a new unsupported kind or a new emitter family.

## Problem

TypeScript types can describe runtime values the JIT compiler cannot faithfully validate, serialise, or deserialise. Examples:

- `Promise<T>` — asynchronous; the JIT can't sample the resolved value synchronously
- `symbol` — carries runtime identity that does not survive JSON or compare equal across realms
- `Function` / `() => T` — has no value form to encode
- `never` — has no inhabitants
- `WeakMap` / `WeakSet` — no enumerable contents
- Future kinds with no emit yet

Rather than silently producing a half-working factory (or worse, a lossy one that round-trips to a different value), ts-go-run-types classifies these kinds as **unsupported** and gives the user a clear, build-time-visible signal about it. The same mechanism powers both the runtime throw and the build-time diagnostic, so users see the problem the moment they wire up a marker call.

## The two-rule model

The pipeline applies exactly two rules:

1. **Property / PropertySignature children that are unsupported are dropped silently from the parent's emit**, with a build-time diagnostic naming the dropped member. The rest of the object's validator / serializer continues to work.
2. **Everywhere else** (root, array element, tuple slot, union member, function param / return, Map key / value, Set member, index signature value, intersection) **propagates upward to the root, where the factory is rendered as an `alwaysThrow` entry**. Calling `createXxx<T>()` for that T throws at the call site with a code like `[PJ001] Never type cannot be encoded to JSON.`

This mirrors mion's `getJitChildren` filter — the only "skip" in the upstream library is property-level absorption; everything else throws.

## Why these rules

- **Properties are non-positional and optional-tolerant**: a JSON object can lack a key without breaking shape. Dropping `onClick` from `User` leaves a valid `User` JSON document. The structural type just becomes lossy at that slot — which is acceptable since the slot's type was un-encodable to begin with.
- **Arrays, tuples, maps, sets, function signatures are positional or sequential**: dropping an element changes length or breaks shape. The only sound options are throw or lossy padding (`null` placeholders that the decoder can't distinguish from real null entries); throw preserves user intent — the user asked for a serialiser; they get one, and they get told it can't work for this shape.
- **Root has nothing to absorb up to** — throw is the only option.

## The unsupported set

| Kind                              | Why                                          | Code family |
| --------------------------------- | -------------------------------------------- | ----------- |
| `KindNever`                       | No inhabitants                               | `XX001`     |
| `KindClass` + SubKindNonSerializable | Non-serialisable (WeakMap, Int8Array, …) | `XX002`     |
| `KindPromise`                     | Async — can't sample synchronously           | `XX002`     |
| `KindFunction` / `KindMethod` / `KindMethodSignature` / `KindCallSignature` | No serialisable value form | `XX003` |
| `KindSymbol`                      | Runtime identity not round-trippable; not comparable across realms | `XX005` |
| Future kinds without an emit      | Walker falls through                         | (unregistered → silent skip) |

`XX` is the per-family prefix. Each JIT function family has its own:

- `PJ` — prepareForJson
- `PJS` — prepareForJsonSafe
- `PJP` — prepareForJsonSafePreserve
- `RJ` — restoreFromJson
- `SJ` — stringifyJson
- `TB` — toBinary
- `FB` — fromBinary
- `IT` — isType
- `TE` — typeErrors

So the same logical throw (Never at root) surfaces as `PJ001` under prepareForJson, `SJ001` under stringifyJson, `TB001` under toBinary, etc. Users reading their build log can grep by family prefix.

## Wire format

A factory rendered for an unsupported root looks like:

```js
init('pj_<hash>', '<typeName>', undefined, false, undefined, undefined, undefined, 'PJ001')
```

The 8th argument is `alwaysThrowCode`. The JS-side `init()` consumer constructs a throwing factory from it via `messageForCode(code)` — see `packages/ts-go-run-types/src/jit/diagnosticMessages.ts`. The error thrown at runtime is:

```
Error: [PJ001] Never type cannot be encoded to JSON.
```

The `[code]` prefix lets users grep by code OR by message phrase.

Normal factories use the 7-arg form (`alwaysThrowCode` defaults to `undefined`); noop factories use a 4-arg form (`isNoop=true`, trailing args omitted). Three init() shapes total:

- **Normal**: `init(hash, typeName, codeBody, false, jitDeps, pureFnDeps, createJitFn)`
- **Noop**: `init(hash, typeName, undefined, true)` — JS side fills in an identity factory
- **AlwaysThrow**: `init(hash, typeName, undefined, false, undefined, undefined, undefined, 'PJ001')` — JS side constructs the throwing factory from the code

## How an emit signals "unsupported"

The kind's arm in the emitter's `Emit` switch returns `JitCode{Code: "", Type: CodeNS}`. That's it. No message, no list, no special function:

```go
case protocol.KindNever:
    return JitCode{Code: "", Type: CodeNS}

case protocol.KindSymbol:
    return JitCode{Code: "", Type: CodeNS}
```

The walker latches the leaf RT (`Walker.UnsupportedLeaf`); the renderer derives the per-family code via `Emitter.DiagCodeForLeaf(leaf)`. The emit doesn't know which code or message will surface — that's the renderer's job, driven by the active emitter's family.

## How a parent absorbs

Only `emitProperty*` (and the PropertySignature path) absorbs. The pattern:

```go
childJit := ctx.CompileChild(rt.Child, CodeS)
if childJit.Type == CodeNS {
    leaf := ctx.walker.UnsupportedLeaf
    code := ctx.DiagCodeForLeaf(leaf)
    ctx.EmitDiagnostic(code, "property "+rt.Name+" has unsupported type and is excluded")
    ctx.walker.AbsorbUnsupported()
    return JitCode{Code: "", Type: CodeS}
}
```

`AbsorbUnsupported()` resets the walker latch so sibling properties can also absorb their own `CodeNS` independently. Non-property parents skip the absorb path and propagate `CodeNS` unchanged — the propagation reaches root, the renderer fires the `alwaysThrow` path.

## Adding a new unsupported kind

When a new TypeScript kind lands that the JIT can't handle:

1. In each affected emitter's kind switch, ensure the new kind's arm either is absent (falls through to the default `CodeNS`) or explicitly returns `JitCode{Code: "", Type: CodeNS}`.
2. Register per-family codes in `internal/diag/codes_runtype.go` (one per family that has an emit).
3. Add the kind → code mapping to each emitter's `DiagCodeForLeaf` switch in `internal/compiled/typefns/diag_codes.go`.
4. Add the messages to `packages/ts-go-run-types/src/jit/diagnosticMessages.ts`.

No edits to walker, renderer, or skeleton files needed — the pipeline picks it up automatically.

## Adding a new emitter family

When porting a new mion JIT function (e.g. `mockType`, a new serialiser):

1. Implement the `Emitter` interface in `internal/compiled/typefns/<family>.go`.
2. Implement `LeafDiagCodeProvider.DiagCodeForLeaf` in `internal/compiled/typefns/diag_codes.go` — one switch over the unsupported kinds returning per-family codes.
3. Add the family's codes in `internal/diag/codes_runtype.go` and `packages/ts-go-run-types/src/jit/diagnosticMessages.ts`.
4. Wire the family's renderer in `internal/resolver/render.go` and `internal/resolver/dispatch.go`.
5. Add a new skeleton file in `internal/cachetpl/skeletons/` and a corresponding cache module in `packages/ts-go-run-types/src/caches/`.

The walker, property-absorb mechanism, alwaysThrow renderer, and 8-arg init() shape all work without further changes.

## FAQ

**"Why doesn't my `getRuntypeId<{onClick: () => void}>()` throw any more?"**
Property-level absorption is now the rule. The validator works for the rest of the object; `onClick` drops with an `IT010` / `IT011` diagnostic. To see the diagnostics, build with the Vite plugin and check the Problems panel — or read the Go binary's `Response.Diagnostics` field directly.

**"My symbol-typed property stopped validating!"**
`KindSymbol` was reclassified as unsupported because symbol identity doesn't survive serialisation, and symbol values aren't comparable across realms (or round-trips). A validator asserting "this is a symbol" gives a false sense of safety — the user can't actually round-trip the value, can't transfer it across a worker boundary, can't compare it to a constant. Use a stable string key (or a string-backed enum) instead.

**"What about symbol literals (well-known symbols)?"**
`KindLiteral` with `Flags=['symbol']` (e.g. `type T = typeof Symbol.iterator`) is a separate code path. Well-known symbols remain supported because their identity IS stable across realms.

**"My factory used to throw at creation time; now it throws at call time. Why?"**
The throw used to be wired via an inline `function(utl){throw new Error(...)}` factory that fired the first time the user invoked `createXxx<T>()` — which then called into `materializeJitFn` and the throw bubbled up. With the alwaysThrow wire format, the throw fires the same place (call time, on the user-returned validator), just constructed from a code instead of an embedded function body. The thrown error message gains a `[code]` prefix for grep-ability.

**"Can I localise / override a diagnostic message?"**
Override `packages/ts-go-run-types/src/jit/diagnosticMessages.ts` at build time (e.g. via a Vite plugin alias). The codes are stable; the messages are what gets localised.

**"How do I see all the codes the binary can emit?"**
Read `internal/diag/codes_*.go`. Every code with its family and severity is registered there. Codes are stable strings — once shipped, they don't change.
