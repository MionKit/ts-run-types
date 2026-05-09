# Collection types

This document covers the **collection** `ReflectionKind`s — types that contain multiple children, or wrap a heterogeneous structure. Atomic kinds live in [atomic-types.md](atomic-types.md); single-child member kinds (`Array`, `Property`, `Method`) live in [member-types.md](member-types.md).

Each section shows:

- both call forms (`getRuntypeId<T>()` static, `reflectRuntypeId(v)` reflection),
- the shape of the resulting cache entry,
- how child slots are wired (refs vs inline).

> **Child slots are refs.** A collection's `types`, `parameters`, `return`, `index`, `indexType` fields hold `{ kind: -1, id: "<hash>" }` sentinels in the JSON wire format. The emitted runtime cache replaces those sentinels with direct references to the actual `t_<id>` consts so consumers walk a fully-knotted graph with no dereferencing step. See [ARCHITECTURE.md](ARCHITECTURE.md) for emit mechanics.

---

## Tuple — `KindTuple`

A fixed-length list with per-slot types. The `types` array holds `KindTupleMember` entries; each member's `Optional` flag marks `[A, B?]`-style optional slots, `Rest` flags `[...A[]]`-style rest slots.

```ts
getRuntypeId<[number, string?]>();
const tup: [number, string?] = [1];
reflectRuntypeId(tup);
```

Cache entry shape:

```json
{
  "kind": 26,
  "types": [
    { "kind": -1, "id": "<member0>" },
    { "kind": -1, "id": "<member1>" }
  ]
}
```

### `KindTupleMember` (inline)

Each tuple slot is wrapped in a `KindTupleMember` so per-slot annotations (`optional`, `rest`) attach to the member rather than the underlying type. A `KindTupleMember` carries a single `type` ref and is only valid inside a parent tuple.

```json
{ "kind": 27, "optional": true, "type": { "kind": -1, "id": "<string-hash>" } }
```

---

## Union — `KindUnion`

Flat list of member types. Discriminated unions, simple `A | B` unions, and string-enum-like unions all land here.

```ts
type Result = { ok: true; value: number } | { ok: false; error: string };
getRuntypeId<Result>();
declare const x: Result;
reflectRuntypeId(x);
```

Cache entry shape:

```json
{ "kind": 23, "types": [ { "kind": -1, "id": "<ok-true>" }, { "kind": -1, "id": "<ok-false>" } ] }
```

---

## Intersection — `KindIntersection`

Same shape as `KindUnion` but with intersection semantics. Members live in `types`.

```ts
type Mix = { a: number } & { b: string };
getRuntypeId<Mix>();
```

---

## Promise — `KindPromise`

A wrapper carrying the resolved value type in `.type`. Documented here rather than under members because semantically it's a container that introduces async behaviour, not a plain single-typed slot.

```ts
getRuntypeId<Promise<number>>();
declare const p: Promise<number>;
reflectRuntypeId(p);
```

Cache entry shape:

```json
{ "kind": 19, "type": { "kind": -1, "id": "<number-hash>" } }
```

---

## Function — `KindFunction`

A free standing callable. Parameters live in `.parameters` (each a `KindParameter` with `name`, `type`, `optional`); return type in `.return`.

(For named callable members declared inside a class or object literal, see `Method` / `MethodSignature` in [member-types.md](member-types.md) — those carry the same parameter/return shape inline alongside a name.)

```ts
getRuntypeId<(a: number, b: number) => number>();
const add = (a: number, b: number) => a + b;
reflectRuntypeId(add);
```

Cache entry shape:

```json
{
  "kind": 17,
  "parameters": [
    { "kind": -1, "id": "<param-a>" },
    { "kind": -1, "id": "<param-b>" }
  ],
  "return": { "kind": -1, "id": "<number-hash>" }
}
```

Each `KindParameter` is `{ kind: 18, name: "a", type: { kind: -1, id: "<number>" }, optional?: bool }`.

---

## ObjectLiteral — `KindObjectLiteral`

A structural object. Each property lives in `types` as a `KindPropertySignature` (or `KindMethodSignature` for inline function members). Index signatures live alongside properties as `KindIndexSignature`.

```ts
type User = { id: number; name: string };
getRuntypeId<User>();
const u = { id: 1, name: 'm' } as User;
reflectRuntypeId(u);
```

Cache entry shape:

```json
{
  "kind": 30,
  "typeName": "User",
  "types": [
    { "kind": -1, "id": "<id-prop>" },
    { "kind": -1, "id": "<name-prop>" }
  ]
}
```

The `PropertySignature` / `MethodSignature` children themselves are documented in [member-types.md](member-types.md).

### Index signatures — `KindIndexSignature`

For `{ [k: K]: V }`-style declarations. Lives inside the parent's `types` list alongside property signatures. `index` holds the key type, `type` holds the value type.

```ts
interface M { [k: string]: number }
getRuntypeId<M>();
declare const m: M;
reflectRuntypeId(m);
```

```json
{
  "kind": 31,
  "index": { "kind": -1, "id": "<string-hash>" },
  "type":  { "kind": -1, "id": "<number-hash>" }
}
```

---

## Class — `KindClass`

User-defined classes (or built-in interfaces TS represents as classes). `typeName` carries the class name; `types` holds the member list — `KindProperty` for fields, `KindMethod` for methods. The `ClassRef.Builtin` field is set for known built-ins (`Date`, `Map`, `Set`, `RegExp`).

```ts
class User {
  id: number = 0;
  greet(): void {}
}
getRuntypeId<User>();
declare const u: User;
reflectRuntypeId(u);
```

Cache entry shape:

```json
{
  "kind": 20,
  "typeName": "User",
  "types": [
    { "kind": -1, "id": "<id-prop>" },
    { "kind": -1, "id": "<greet-method>" }
  ]
}
```

The `Property` / `Method` children themselves are documented in [member-types.md](member-types.md).

---

## Recursive types

Cycle closure happens at the emit layer, not in the cache structure itself. Internally a cycle is represented by `KindRef` sentinels — entries whose `kind` is `-1` and whose `id` points back at an existing entry. The emitter's footer fills in those references by direct const assignment **after** all `t_<id>` declarations have been emitted, so a fully-knotted graph is ready by module load.

### Self-recursive

```ts
interface Tree { children: Tree[] }
getRuntypeId<Tree>();
declare const t: Tree;
reflectRuntypeId(t);
```

The walk path is `Tree → Property("children") → Array → Tree`. The element-type slot of the inner `Array` is the same id as the root `Tree` entry. At runtime, `root.types[0].type.type === root` holds by reference.

### Mutually recursive

```ts
interface A { b: B }
interface B { a: A }
getRuntypeId<A>();
declare const a: A;
reflectRuntypeId(a);
```

Two cache entries (`A` and `B`); each closes back on the other through a property's `.type` slot. Cycle termination is by id-equality on the second visit, not by depth limit — the cache always wins.

---

## See also

- [atomic-types.md](atomic-types.md) — primitives, regex, literals, enums, `Date`.
- [member-types.md](member-types.md) — single-typed members: `Array`, `Property`, `Method` (and their structural-signature counterparts).
- [ARCHITECTURE.md](ARCHITECTURE.md) — overall pipeline and design.
