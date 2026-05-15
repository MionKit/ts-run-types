# Member types

This document covers the **structured** `ReflectionKind`s — types that contain other types. Atomic kinds (primitives, regex, literals, enums, `Date`) live in [atomic-types.md](atomic-types.md).

Each section shows:

- both call forms (`getRuntypeId<T>()` static, `reflectRuntypeId(v)` reflection),
- the shape of the resulting cache entry,
- how child slots are wired (refs vs inline).

> **Child slots are refs.** A member type's `type`, `types`, `parameters`, `return`, `index`, `indexType` fields hold `{ kind: -1, id: "<hash>" }` sentinels in the JSON wire format. The emitted runtime cache replaces those sentinels with direct references to the actual `t_<id>` consts so consumers walk a fully-knotted graph with no dereferencing step. See [ARCHITECTURE.md](ARCHITECTURE.md) for emit mechanics.

---

## Array — `KindArray`

Element type lives in `.type`.

```ts
getRuntypeId<string[]>();
const xs: string[] = ['a', 'b'];
reflectRuntypeId(xs);
```

Cache entry shape:

```json
{ "kind": 25, "type": { "kind": -1, "id": "<string-hash>" } }
```

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

Each referenced member is a `KindTupleMember{ optional?: bool, type: <ref> }`.

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

The resolved value lives in `.type`.

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

Parameters live in `.parameters` (each a `KindParameter` with `name`, `type`, `optional`), return type in `.return`.

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

### Property signatures

`KindPropertySignature` carries `name` and `type`:

```json
{ "kind": 32, "name": "id", "type": { "kind": -1, "id": "<number>" } }
```

### Index signatures — `KindIndexSignature`

For `{ [k: K]: V }`-style declarations. `index` holds the key type, `type` holds the value type.

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

### `KindProperty` vs `KindPropertySignature`

`KindProperty` is the **class** form (declared in a `class { … }`); `KindPropertySignature` is the **structural** form (declared in a `type { … }` or `interface { … }`). Same field shape (`name`, `type`) but the kind discriminator tells the runtime which it is.

Same split for methods: `KindMethod` (class) vs `KindMethodSignature` (structural).

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
- [ARCHITECTURE.md](ARCHITECTURE.md) — overall pipeline and design.
