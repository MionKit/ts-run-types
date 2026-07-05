# Function-free `circular` via the `self()` marker (and fix the spurious CTA001)

Status: **DONE (shipped).** Implemented as the function-free `circular(body)` form
(callback overload REMOVED — option (b), pre-release). Fixes finding **F** at the root
and the companion MKR001 false positive. Full JS + Go + fuzz suites green. Covers finding **F** from
[optional-boolean-union-encoding.md](../done/optional-boolean-union-encoding.md) (the
spurious `CTA001` on schema-form recursion) and the API simplification that fixes
it at the root.

## The idea

Today a value-first recursive schema is written with an **enclosing callback** that
receives a `self` handle:

```ts
const Node = circular((self) => object({value: number(), next: optional(self)}));
type Node = Static<typeof Node>;   // {value: number; next?: Node}
```

That callback shape is inherited from **runtime** schema libraries (TypeBox et al.),
which genuinely need a closure to capture the self-reference at run time. RunTypes
resolves types at **compile time**, so the closure is pure ceremony — a standalone
`self()` **marker** placed directly in the body is enough:

```ts
const Node = circular(object({value: number(), next: optional(self())}));
```

No enclosing function, no `self` parameter.

## Why this already works (no new type machinery needed)

- The standalone `self()` builder ALREADY exists
  ([schema/compose.ts](../../packages/ts-runtypes/src/schema/compose.ts) — `self()`
  returns `{type: 'self'}`), and the type-level knot is tied entirely by
  `Recursive<Body> = SubstituteSelf<Body, [Recursive<Body>]>` + the `Self` brand
  ([schema/static.ts](../../packages/ts-runtypes/src/schema/static.ts):211-257) —
  **not** by the callback.
- The runtime `circular` already reduces the callback to the marker form:
  ```ts
  export function circular<Body>(callback, id?) {
    return builderResult(id, {type: 'circular', child: callback(self())}); // ← callback(self())
  }
  ```
  So `circular((self) => body)` is literally `{type:'circular', child: body-with-self()-substituted}`
  at run time. The callback adds nothing the marker doesn't.

## Why it fixes finding F (the spurious CTA001)

F: the schema builder `array(item: CompTimeArgs<RunType<T>>)` marks its argument as
`CompTimeArgs`, so the scanner runs `checkCompTimeArgs` on it. In the callback form,
`array(self)` passes `self` — an **`Identifier`** (the callback parameter). `CheckLiteral`
routes identifiers to `traceIdentifier`, which can't resolve a runtime-supplied
callback parameter to anything static → `FailNonLiteral` → **CTA001 (Error)**
([internal/compiler/comptimeargs/comptimeargs.go](../../internal/compiler/comptimeargs/comptimeargs.go):137,
[internal/resolver/scan.go](../../internal/resolver/scan.go):848-870), even though
codegen succeeds.

In the marker form, `array(self())` passes `self()` — a **`CallExpression`** for a
recognized builder. `CheckLiteral`'s `KindCallExpression` arm accepts a builder call
as a valid leaf → **no diagnostic**.

**Empirically confirmed** (regenerated straight off `bin/ts-runtypes`):

| Form | Source | Diagnostics | Recursion resolves |
|------|--------|-------------|--------------------|
| callback | `circular((self) => object({children: array(self)}))` | **CTA001** | ✅ |
| marker | `circular((s) => object({children: array(self())}))` | **none** | ✅ (children iterated, self-call present) |

(The marker probe still had a dummy callback for signature reasons; the type +
resolver behaviour is identical to the fully function-free form.)

## Proposed change

1. **Add a function-free `circular` overload** that takes the body directly:
   ```ts
   export function circular<Body>(
     body: CompTimeArgs<RunType<Body>>,
     id?: InjectRunTypeId<Recursive<Body>>
   ): RunType<Recursive<Body>>;
   ```
   Runtime: `{type: 'circular', child: body}` (no callback invocation). `Body` is
   inferred from the body value, where each `self()` has type `RunType<Self>`;
   `Recursive<Body>` substitutes `Self` → the recursive type. The existing type
   machinery needs no change.
2. **Make the marker form the documented/recommended API.** Update the README, the
   website docs, [schema/static.ts](../../packages/ts-runtypes/src/schema/static.ts)
   comments, the example under [packages/examples](../../packages/examples), and the
   Go fixtures ([internal/testfixtures](../../internal/testfixtures)) to
   `circular(object({… self() …}))`.
3. **Decide the callback form's fate** (open decision):
   - (a) **Deprecate + keep** for back-compat — but it STILL emits CTA001, so also
     patch `traceIdentifier` / the builder-call predicate to recognize an identifier
     bound to a `circular` callback parameter as a valid `CompTimeArgs` leaf (return
     `Ok`), so existing callers don't error.
   - (b) **Remove** the callback overload (breaking change; simplest, and F vanishes
     with no comptimeargs patch). Given the project is pre-release, this may be
     cleanest.
   - Recommendation: (b) if we can churn the API pre-release; otherwise (a).

## Scope / where to change

- **TS**: `circular` overload + runtime ([schema/compose.ts](../../packages/ts-runtypes/src/schema/compose.ts):281),
  type comments ([schema/static.ts](../../packages/ts-runtypes/src/schema/static.ts):195-257).
  The `Self` / `Recursive` / `SubstituteSelf` types are unchanged.
- **Go**: expected **no change** — the resolved type (`Recursive<Body>` with `Self`
  substituted) is identical whether the body came from a callback or directly; the
  scanner reflects the same recursive type. Only relevant if we take option (a)
  (patch `comptimeargs`).
- **Docs**: README, [container/website/content](../../container/website/content),
  static.ts examples, examples package.
- **Tests**: value-first recursive fixtures/tests switch to the marker form; add a
  regression asserting a marker-form recursive schema produces **zero diagnostics**
  (the F guard) and round-trips. Keep the `getRunTypeId` paired-shape coverage.

## Investigation checklist

- [x] Confirm `self()` standalone marker exists and `circular` reduces to `callback(self())`.
- [x] Confirm the type-level recursion is `Recursive<Body>` + `Self` (callback-independent).
- [x] Confirm the marker form resolves recursion with **no CTA001** (empirical).
- [x] Ship the function-free `circular(body)` form + runtime (`compose.ts`); `Static<>` typechecks.
- [x] Go scanner needed no change for the body form — EXCEPT a companion fix: MKR001
      (reflect-form marker given a function-call value) false-fired on `circular(object(…))`;
      excluded schema-builder calls from the check (`scan.go`).
- [x] Chose **option (b): remove** the callback overload (pre-release).
- [x] Migrated all recursive schemas (tests, playground presets + fake dts, benchmarks) via
      an AST codemod; full JS + Go + fuzz suites green.

### Shipped in

- `feat(schema): function-free circular(body) via the self() marker; drop callback`
- (companion) `fix(typeid): encode optional flag in tuple-slot id; …`
