# Member types

This document covers the **member** `ReflectionKind`s — types that carry a single child type, optionally with a name. Atomic kinds live in [atomic-types.md](atomic-types.md); composite kinds (tuples, unions, classes, object literals, …) live in [collection-types.md](collection-types.md).

The three members are:

- **Array** — element type only, no name.
- **Property** / **PropertySignature** — named carrier of a single type. The bare form (`KindProperty`) appears inside a `class`; the signature form (`KindPropertySignature`) appears inside a `type` / `interface`.
- **Method** / **MethodSignature** — same name+kind split, but the carried type is a function signature.

> **Naming convention.** Mirrors mion's `packages/run-types/src/nodes/member` taxonomy — a "member" is a single-typed unit; multi-typed containers are documented in [collection-types.md](collection-types.md).
>
> **Child slots are refs.** A member's `child` field holds a `{ kind: -1, id: "<hash>" }` sentinel in the JSON wire format. The emitted runtime cache replaces the sentinel with a direct reference to the actual `t_<id>` const so consumers walk a fully-knotted graph with no dereferencing step. See [ARCHITECTURE.md](ARCHITECTURE.md) for emit mechanics.

---

## Array — `KindArray`

A homogeneous sequence. Element type lives in `.child`.

```ts
getRuntypeId<string[]>();
const xs: string[] = ['a', 'b'];
reflectRuntypeId(xs);
```

Cache entry shape:

```json
{ "kind": 25, "child": { "kind": -1, "id": "<string-hash>" } }
```

Array is a member rather than a collection because it carries a single child type — same shape as `Property` and `Promise`, just unnamed.

---

## Property — `KindProperty` / PropertySignature — `KindPropertySignature`

A named slot carrying a single type. Two flavours:

- `KindProperty` — declared inside a `class { … }`.
- `KindPropertySignature` — declared inside a `type { … }` or `interface { … }`.

Same field shape (`name`, `child`, optional `optional` / `readonly` flags); the kind discriminator tells the runtime which declaration site it came from. They never appear at the top of a type — always nested inside their parent class / object literal — but they get their own cache entries because they carry a name.

```ts
class User {
  id: number = 0;             // KindProperty
}

type User2 = {
  id: number;                 // KindPropertySignature
};
```

Cache entry shape (the signature form):

```json
{
  "kind": 32,
  "name": "id",
  "child": { "kind": -1, "id": "<number-hash>" }
}
```

Cache entry shape (the class form):

```json
{
  "kind": 15,
  "name": "id",
  "child": { "kind": -1, "id": "<number-hash>" }
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
  greet(name: string): void;   // KindMethodSignature
};
```

Cache entry shape (the signature form):

```json
{
  "kind": 33,
  "name": "greet",
  "parameters": [
    { "kind": -1, "id": "<param-name>" }
  ],
  "return": { "kind": -1, "id": "<void-hash>" }
}
```

---

## See also

- [atomic-types.md](atomic-types.md) — primitives, regex, literals, enums, `Date`.
- [collection-types.md](collection-types.md) — multi-typed containers: tuples, unions, intersections, promises, functions, object literals, classes, recursive types.
- [ARCHITECTURE.md](ARCHITECTURE.md) — overall pipeline and design.
