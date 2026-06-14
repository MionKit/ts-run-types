# Member types

> _Resurfaced historical doc, kept as a record of implemented work. `reflectRunTypeId(value)` is now `getRunTypeId(value)`. Some paths and symbols below may since have been renamed, removed, or ported to Go._

This document covers the **member** `ReflectionKind`s — types that carry a single child type, optionally with a name. Atomic kinds live in [atomic-types.md](atomic-types.md); composite kinds (tuples, unions, classes, object literals, …) live in [collection-types.md](collection-types.md).

The members are:

- **Array** — element type only, no name.
- **Promise** — resolved-value type only, no name.
- **Property** / **PropertySignature** — named carrier of a single type. The bare form (`KindProperty`) appears inside a `class`; the signature form (`KindPropertySignature`) appears inside a `type` / `interface`.
- **Method** / **MethodSignature** — same name+kind split, but the carried type is a function signature.

> **Naming convention.** Mirrors mion's `packages/run-types/src/nodes/member` taxonomy — a "member" is a single-typed unit; multi-typed containers are documented in [collection-types.md](collection-types.md).
>
> **Child slots are refs.** A member's `child` field holds a `{ kind: -1, id: "<hash>" }` sentinel in the JSON wire format. The emitted runtime cache replaces the sentinel with a direct reference to the actual `t_<id>` const so consumers walk a fully-knotted graph with no dereferencing step. See [ARCHITECTURE.md](ARCHITECTURE.md) for emit mechanics.

---

## Array — `KindArray`

A homogeneous sequence. Element type lives in `.child`.

```ts
getRunTypeId<string[]>();
const xs: string[] = ['a', 'b'];
reflectRunTypeId(xs);
```

Cache entry shape:

```json
{"kind": 25, "child": {"kind": -1, "id": "<string-hash>"}}
```

Array is a member rather than a collection because it carries a single child type — same shape as `Property` and `Promise`, just unnamed.

---

## Promise — `KindPromise`

A wrapper carrying the resolved value type in `.child`. Same single-unnamed-child shape as `Array`, just with async semantics — `Promise<T>` always resolves to exactly one type.

```ts
getRunTypeId<Promise<number>>();
declare const p: Promise<number>;
reflectRunTypeId(p);
```

Cache entry shape:

```json
{"kind": 19, "child": {"kind": -1, "id": "<number-hash>"}}
```

---

## Property — `KindProperty` / PropertySignature — `KindPropertySignature`

A named slot carrying a single type. Two flavours:

- `KindProperty` — declared inside a `class { … }`.
- `KindPropertySignature` — declared inside a `type { … }` or `interface { … }`.

Same field shape (`name`, `child`, optional `optional` / `readonly` flags); the kind discriminator tells the runtime which declaration site it came from. They never appear at the top of a type — always nested inside their parent class / object literal — but they get their own cache entries because they carry a name.

```ts
class User {
  id: number = 0; // KindProperty
}

type User2 = {
  id: number; // KindPropertySignature
};
```

Cache entry shape (the signature form):

```json
{
  "kind": 32,
  "name": "id",
  "child": {"kind": -1, "id": "<number-hash>"}
}
```

Cache entry shape (the class form):

```json
{
  "kind": 15,
  "name": "id",
  "child": {"kind": -1, "id": "<number-hash>"}
}
```

---

## Method — `KindMethod` / MethodSignature — `KindMethodSignature`

A named slot carrying a function signature. Same class-vs-structural split as `Property`:

- `KindMethod` — declared inside a `class { … }`.
- `KindMethodSignature` — declared inside a `type { … }` or `interface { … }`.

The function signature is carried inline on the method node — `parameters` and `return` live alongside `name` rather than being nested under a separate `KindFunction` child.

```ts
class User {
  greet(name: string): void {} // KindMethod
}

type Greeter = {
  greet(name: string): void; // KindMethodSignature
};
```

Cache entry shape (the signature form):

```json
{
  "kind": 33,
  "name": "greet",
  "parameters": [{"kind": -1, "id": "<param-name>"}],
  "return": {"kind": -1, "id": "<void-hash>"}
}
```

---

## Modifiers, position, and safe property names

Every member node carries its **distinguishing fields** alongside the child type. These are gated by `omitempty` so a member only emits the slots that apply to it.

| Field        | Wire type                                     | Applies to                                                                             | Meaning                                                                                                                                                                                                        |
| ------------ | --------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`       | string                                        | Property, PropertySignature, Method, MethodSignature, Parameter, TupleMember (labeled) | The member's identifier as written in source. Tuple members without a label carry no `name`.                                                                                                                   |
| `optional`   | `true` (omitted = false)                      | All member kinds                                                                       | `foo?: …` / `b?:` slot / optional parameter.                                                                                                                                                                   |
| `readonly`   | `true` (omitted = false)                      | Property, PropertySignature, IndexSignature                                            | `readonly foo` modifier.                                                                                                                                                                                       |
| `static`     | `true` (omitted = false)                      | Property, Method                                                                       | Class-only `static` keyword.                                                                                                                                                                                   |
| `abstract`   | `true` (omitted = false)                      | Property, Method                                                                       | Class-only `abstract` keyword.                                                                                                                                                                                 |
| `visibility` | `0` \| `1` \| `2` (omitted = implicit public) | Property, Method                                                                       | `0` = public, `1` = protected, `2` = private. Mirrors mion / deepkit's `ReflectionVisibility` enum.                                                                                                            |
| `default`    | literal value (omitted = none)                | Parameter                                                                              | Literal initializer (`5`, `"x"`, `true`, `null`). Non-literal initializers (expressions, function calls) leave `default` unset and append `flags: ["nonLiteralDefault"]` instead — mion's existing convention. |
| `position`   | integer (omitted when absent)                 | Parameter, TupleMember                                                                 | 0-based slot index in the parent. Shipped explicitly so consumers don't have to `indexOf` against the parent array.                                                                                            |
| `isSafeName` | `true` (omitted = false)                      | Property, PropertySignature, Method, MethodSignature                                   | True when `name` is a valid JS identifier (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) or all digits — i.e. `obj.<name>` dot access is legal. False/missing means bracket notation is required (`obj["weird name"]`).        |

`isSafeName` is a ports of mion's helper at [`packages/run-types/src/lib/utils.ts:90`](https://github.com/MionKit/mion/blob/main/packages/run-types/src/lib/utils.ts#L90); shipping the boolean on every member lets downstream codegen pick dot-vs-bracket at compile time without re-running the regex.

Worked example — `class U { public id = 0; private secret = ""; static count = 0; readonly tag = "t"; "weird name": boolean = false; }` serializes to five property nodes with, respectively: `visibility:0` + `isSafeName:true`; `visibility:2` + `isSafeName:true`; `static:true` + `visibility:0` + `isSafeName:true`; `readonly:true` + `visibility:0` + `isSafeName:true`; `isSafeName` omitted (the `weird name` member requires bracket access).

---

## See also

- [atomic-types.md](atomic-types.md) — primitives, regex, literals, enums, `Date`.
- [collection-types.md](collection-types.md) — multi-typed containers: tuples, unions, intersections, functions, object literals, classes, recursive types.
- [ARCHITECTURE.md](ARCHITECTURE.md) — overall pipeline and design.
