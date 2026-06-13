# Value-first schema type-checking cost vs TypeBox

**Status:** investigation notes (no fix proposed). Surfaced by the benchmark's
type-instantiation measurement (PR #100, `benchmarks/typecost.mjs`): ts-go's
value-first **schema form** costs noticeably more TypeScript instantiations to
resolve than TypeBox's `Static<>` (apples-to-apples avg ~515 vs ~201 per case;
e.g. `REALWORLD.order` ts-go-schema 3747 vs typebox 1531). This records _why_,
from reading both implementations. ts-go's **type-definition form**
(`createValidate<T>()`) is ~0 instantiations and unaffected — this only concerns
the value-first `createValidate(RT.…)` path.

## How TypeBox carries the type (cheap)

`@sinclair/typebox` keeps the schema's runtime type **shallow** and defers the
represented TS type to a **lazy phantom member**:

- `interface TSchema { …; params: unknown[]; static: unknown }`
  (`build/cjs/type/schema/schema.d.ts`).
- Each schema interface overrides `static`. For objects
  (`type/object/object.d.ts`):
  ```ts
  interface TObject<T extends TProperties> extends TSchema {
    static: ObjectStatic<T, this['params']>;   // ← not computed until read
    properties: T;
  }
  type ObjectStatic<T, P> = Evaluate<…Pick-groups over {[K in keyof T]: Static<T[K], P>}…>;
  ```
- `Type.Object(props)` returns `TObject<typeof props>` — parameterized by the
  **child schemas**, not by the represented type. Building the schema
  instantiates almost nothing.
- `Static<S> = (S & {params})['static']` (`type/static/static.d.ts`) — a plain
  **indexed access** that triggers `ObjectStatic` **once**, at extraction. The
  assembly is a single homomorphic mapped type + key-group filtering for
  `?`/`readonly`.

Net: building is ~free; the represented type is computed **once, lazily**, only
when `Static<>` is read.

## How ts-go carries the type (more expensive)

The value-first builders assemble the **full represented type eagerly** in the
builder's signature (`packages/ts-go-run-types/src/schema/compose.ts`):

```ts
function object<const C extends Record<string, unknown>>(
  config: CompTimeArgs<C>,
  id?: InjectRunTypeId<ObjectType<C>> // ← assembled type, reference #1
): RunType<ObjectType<C>>; // ← assembled type, reference #2
```

- `ObjectType<C>` (`src/schema/static.ts`) is the represented object type,
  assembled as a **4-way intersection** of `Pick` groups (the optional×readonly
  combinations — "TS can't apply `?`/`readonly` per-key in one homomorphic map").
- It is referenced **twice** per builder — in the return type **and** in the
  `InjectRunTypeId<…>` marker param — so TypeScript materializes it twice at
  **every** builder call, at every nesting level.
- The `config: CompTimeArgs<C>` param adds compile-time literal validation on top.
- `Static<RT> = RT extends RunType ? NonNullable<RT['__rtType']>['t'] : RT` is
  then a cheap read — the cost was already paid eagerly at the builder calls.

Net: both approaches assemble the same object type once conceptually, but ts-go
does it **eagerly, ×2 per call, plus literal validation**, while TypeBox does it
**lazily, ×1 at extraction** — which accounts for most of the gap.

## Possible improvements (discovered, not designed)

1. **Compute the represented type once.** `ObjectType<C>` is materialized in both
   the return type and the `InjectRunTypeId<…>` marker param; collapsing that to
   a single materialization would roughly halve the per-call cost.
2. **Adopt TypeBox's lazy-`static` shape.** Have builders return a shallow carrier
   parameterized by the child builders (à la `TObject<TProperties>`) and assemble
   the represented type once inside `Static<>` (à la `ObjectStatic`), instead of
   eagerly in every builder signature.

## The blocker (why ts-go is eager today)

ts-go's value-first **convergence marker** `InjectRunTypeId<ObjectType<C>>`
deliberately materializes the concrete type at the call site so the value-first
typeId matches the type-first one (value-first and type-first must converge on
the same structural id). That materialization is exactly what forces eager — and
doubled — computation. TypeBox has no equivalent marker, which is _why_ it can
stay lazy. Any move toward laziness has to rework how the value-first marker
derives its id without forcing full type materialization at the builder call.

## Scope / priority

Low priority: the value-first form is the secondary authoring path. ts-go's
type-definition form already type-checks for ~0 instantiations (it beats every
schema library, including TypeBox), so this only narrows the gap for users who
prefer the `createValidate(RT.…)` value-first style.
