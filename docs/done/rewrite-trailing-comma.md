# Call-site rewrite breaks on a trailing comma in the marker call's arguments

**Status:** known bug, not fixed (documentation only). Found while authoring the
benchmark's real-world `validateSchema` thunks (PR #100).

## Symptom

When a rewritten marker call (`createValidate`, `createGetValidationErrors`,
`createJsonEncoder`, …) is written **value-first with a trailing comma in its
argument list**, the plugin emits invalid JavaScript and the build fails with an
esbuild parse error like:

```
ERROR: Unexpected ","
  }),
, undefined, __rt_CiE_aUs2yuI),
```

## Reproduction

```ts
// trailing comma after the schema arg ↓
createValidate(
  RT.object({ id: RT.number() }),   // ← object-literal trailing commas are FINE
),                                  // ← THIS comma (in createValidate's arg list) breaks it
```

becomes, after the call-site injection:

```ts
createValidate(RT.object({ id: RT.number() }), , undefined, __rt_…)
//                                            ^^ stray empty argument
```

## Where

The plugin injects the entry-tuple binding as a trailing argument at each marker
call site (the binding-only injection described in
[CLAUDE.md](../CLAUDE.md) → "Rewrite mechanics"; applied in
[`packages/vite-plugin-runtypes/src/rewrite.ts`](../packages/vite-plugin-runtypes/src/rewrite.ts)).
It appends `… , undefined, __rt_<key>)` before the call's closing `)`, but does
not account for a pre-existing **trailing comma** in the argument list — so the
existing comma plus the injected `, undefined` produce an empty argument
(`f(a, , …)`), which is a syntax error.

## Scope

- Only the **value-first / argument-bearing** marker forms can hit it —
  `createValidate(<RunType>)`, `createValidate(value)`, the JSON/binary encoder
  factories, etc. — and only when the source has a trailing comma in the call's
  argument list (common when a formatter wraps a long single-argument call across
  multiple lines).
- The **type-first** form `createValidate<T>()` is immune: it has no value
  arguments, so there is no trailing comma to collide with.
- The trailing comma **inside** the schema object literal
  (`RT.object({ a: …, })`) is unrelated and harmless — only the comma in
  `createValidate`'s _own_ argument list matters.

## Workaround (today)

Author argument-bearing marker calls without a trailing comma in the call's
argument list, e.g. keep the closing `)` directly after the argument:

```ts
createValidate(
  RT.object({ id: RT.number() })
),
```

The benchmark's real-world value-first schema thunks
([`benchmarks/competitors/ts-runtypes/schemaCases.ts`](../benchmarks/competitors/ts-runtypes/schemaCases.ts))
follow this.

## Fix direction (deferred)

The rewrite should normalize the injection point — drop/skip a trailing comma in
the argument list before appending, or insert the new argument with a leading
comma only when the last token isn't already a comma. Not investigated further
here.
