# Collection types

This document covers the **collection** `ReflectionKind`s — types that contain multiple children, or wrap a heterogeneous structure. Atomic kinds live in [atomic-types.md](atomic-types.md); single-child member kinds (`Array`, `Promise`, `Property`, `Method`) live in [member-types.md](member-types.md).

Each section shows:

- both call forms (`getRuntypeId<T>()` static, `reflectRuntypeId(v)` reflection),
- the shape of the resulting cache entry,
- how child slots are wired (refs vs inline).

> **Child slots are refs.** A collection's `children`, `parameters`, `return`, `index`, `indexType` fields hold `{ kind: -1, id: "<hash>" }` sentinels in the JSON wire format. The emitted runtime cache replaces those sentinels with direct references to the actual `t_<id>` consts so consumers walk a fully-knotted graph with no dereferencing step. See [ARCHITECTURE.md](ARCHITECTURE.md) for emit mechanics.

---

## Tuple — `KindTuple`

A fixed-length list with per-slot types. The `children` array holds `KindTupleMember` entries; each member's `Optional` flag marks `[A, B?]`-style optional slots, `Rest` flags `[...A[]]`-style rest slots.

```ts
getRuntypeId<[number, string?]>();
const tup: [number, string?] = [1];
reflectRuntypeId(tup);
```

Cache entry shape:

```json
{
  "kind": 26,
  "children": [
    { "kind": -1, "id": "<member0>" },
    { "kind": -1, "id": "<member1>" }
  ]
}
```

### `KindTupleMember` (inline)

Each tuple slot is wrapped in a `KindTupleMember` so per-slot annotations (`optional`, `rest`, `position`, label `name`) attach to the member rather than the underlying type. A `KindTupleMember` carries a single `child` ref and is only valid inside a parent tuple. `position` is the member's 0-based slot index — shipped explicitly so consumers don't have to `indexOf` against the parent. Labels from `[a: number, b?: string]`-style declarations land in `name`.

```json
{ "kind": 27, "name": "b", "optional": true, "position": 1, "child": { "kind": -1, "id": "<string-hash>" } }
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
{ "kind": 23, "children": [ { "kind": -1, "id": "<ok-true>" }, { "kind": -1, "id": "<ok-false>" } ] }
```

---

## Intersection — `KindIntersection`

Same shape as `KindUnion` but with intersection semantics. Members live in `children`.

```ts
type Mix = { a: number } & { b: string };
getRuntypeId<Mix>();
```

---

## Function — `KindFunction`

A free standing callable. Parameters live in `.parameters` (each a `KindParameter` with `name`, `child`, `optional`); return type in `.return`.

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

Each `KindParameter` is `{ kind: 18, name: "a", position: 0, child: { kind: -1, id: "<number>" }, optional?: bool, default?: literal }`. Literal defaults (`= 5`, `= "x"`, `= true`, `= null`) land in `default`; non-literal initializers leave `default` unset and append `flags: ["nonLiteralDefault"]`.

### Rest parameters

A trailing `...rest: T[]` parameter is encoded as a regular `KindParameter` with `flags: ["rest"]` and its `child` set to the array type (`T[]`, not the element). Consumers walk the array's `child` to reach the element. Mirrors the tuple-member convention (`KindTupleMember` with `flags: ["rest"]`).

```ts
type Fn = (a: number, ...rest: boolean[]) => string;
//                    ^^^ KindParameter, name: "rest", position: 1, flags: ["rest"]
//                                       child resolves to KindArray<KindBoolean>
```

### Dispatch — Function vs ObjectLiteral with CallSignature

- An object type with **exactly one call signature and no other properties** projects as `KindFunction`. This is the common case (arrow types, function types, function values).
- An object type with **call signatures AND properties** stays as `KindObjectLiteral`; each call signature appears as a `KindCallSignature` child alongside the regular property children. Used for callable interfaces (`interface Tagged { (x: number): string; tag: string; }`).
- A function-typed property INSIDE a class projects as `KindMethod`; inside an interface / object literal it projects as `KindMethodSignature`. Both carry the same `parameters` / `return` slots as `KindFunction`, plus the property `name` and member modifiers (see [member-types.md](member-types.md)).

### Async

There is no explicit `async` flag. Consumers detect async by inspecting `return` — if its kind is `KindPromise`, the function is async. This mirrors mion's `FunctionRunType.isAsync()` (which infers from the resolved return type).

---

## ObjectLiteral — `KindObjectLiteral`

A structural object. Each property lives in `children` as a `KindPropertySignature` (or `KindMethodSignature` for inline function members). Index signatures live alongside properties as `KindIndexSignature`.

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
  "children": [
    { "kind": -1, "id": "<id-prop>" },
    { "kind": -1, "id": "<name-prop>" }
  ]
}
```

The `PropertySignature` / `MethodSignature` children themselves are documented in [member-types.md](member-types.md), including their full modifier surface (`optional`, `readonly`, `isSafePropName`, etc.).

### Index signatures — `KindIndexSignature`

For `{ [k: K]: V }`-style declarations. Lives inside the parent's `children` list alongside property signatures. `index` holds the key type, `child` holds the value type.

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
  "child": { "kind": -1, "id": "<number-hash>" }
}
```

---

## Class — `KindClass`

User-defined classes (or built-in interfaces TS represents as classes). `typeName` carries the class name; `children` holds the member list — `KindProperty` for fields, `KindMethod` for methods. The `ClassRef.Builtin` field is set for known built-ins (`Date`, `Map`, `Set`, `RegExp`).

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
  "children": [
    { "kind": -1, "id": "<id-prop>" },
    { "kind": -1, "id": "<greet-method>" }
  ]
}
```

The `Property` / `Method` children themselves are documented in [member-types.md](member-types.md). Instance and **static** members both land in `children` — statics carry `static: true`; visibility (`public` = 0, `protected` = 1, `private` = 2) lands in `visibility`; `abstract` and `readonly` are emitted as `true` when present.

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

The walk path is `Tree → Property("children") → Array → Tree`. The element-type slot of the inner `Array` is the same id as the root `Tree` entry. At runtime, `root.children[0].child.child === root` holds by reference.

### Mutually recursive

```ts
interface A { b: B }
interface B { a: A }
getRuntypeId<A>();
declare const a: A;
reflectRuntypeId(a);
```

Two cache entries (`A` and `B`); each closes back on the other through a property's `.child` slot. Cycle termination is by id-equality on the second visit, not by depth limit — the cache always wins.

---

## See also

- [atomic-types.md](atomic-types.md) — primitives, regex, literals, enums, `Date`.
- [member-types.md](member-types.md) — single-typed members: `Array`, `Promise`, `Property`, `Method` (and their structural-signature counterparts).
- [ARCHITECTURE.md](ARCHITECTURE.md) — overall pipeline and design.
