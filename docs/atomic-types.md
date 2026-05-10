# Atomic types

This document describes every **atomic** `ReflectionKind` the resolver produces — primitives, regex, literals, enums, and `Date`. Member kinds (`array`, `tuple`, `union`, `class`, `objectLiteral`, …) live in [member-types.md](member-types.md).

Each section shows:

- what TS source produces the kind,
- both call forms (`getRuntypeId<T>()` static, `reflectRuntypeId(v)` reflection),
- the shape of the resulting cache entry.

Two sections — **Literal** and **Enum** — also call out TypeScript quirks where the call shape changes the resulting `Kind` in surprising ways.

> **Marker test coverage rule.** Every scenario below has paired tests in [`internal/resolver/atomic_test.go`](../internal/resolver/atomic_test.go) and [`packages/vite-plugin-runtypes/test/atomic.test.ts`](../packages/vite-plugin-runtypes/test/atomic.test.ts) — one per call form. See `CLAUDE.md`.

---

## Primitives

The simplest entries — `Kind` is set, no payload. The static form uses an explicit type argument; the reflection form annotates the binding so TS doesn't widen.

### String — `KindString`

```ts
getRuntypeId<string>();              // static
declare const v: string;
reflectRuntypeId(v);                 // reflect
```

### Number — `KindNumber`

```ts
getRuntypeId<number>();
const v: number = 42;
reflectRuntypeId(v);
```

### Boolean — `KindBoolean`

```ts
getRuntypeId<boolean>();
declare const v: boolean;
reflectRuntypeId(v);
```

### BigInt — `KindBigInt`

```ts
getRuntypeId<bigint>();
const v: bigint = 1n;
reflectRuntypeId(v);
```

### Symbol — `KindSymbol`

```ts
getRuntypeId<symbol>();
const v: symbol = Symbol('x');
reflectRuntypeId(v);
```

### Null / Undefined / Void — `KindNull` / `KindUndefined` / `KindVoid`

```ts
getRuntypeId<null>();
getRuntypeId<undefined>();
getRuntypeId<void>();
```

### Any / Unknown / Never — `KindAny` / `KindUnknown` / `KindNever`

```ts
getRuntypeId<any>();
getRuntypeId<unknown>();
getRuntypeId<never>();
```

### Object — `KindObject`

The TypeScript `object` primitive (any non-primitive). Distinct from `KindObjectLiteral`.

```ts
getRuntypeId<object>();
const v: object = {};
reflectRuntypeId(v);
```

---

## RegExp

Two outcomes depending on whether the resolver can trace the marker call back to a regex-literal source expression.

### Instance form — `KindRegexp` (`ClassRef.Builtin = "RegExp"`)

Produced when **no regex literal is reachable** from the call site. Examples:

```ts
getRuntypeId<RegExp>();                        // explicit type
declare const re: RegExp;                      // no initializer
reflectRuntypeId(re);
let re = /abc/i;                               // `let` — not traced
reflectRuntypeId(re);
```

Cache entry shape:

```json
{ "kind": 12, "classRef": { "builtin": "RegExp" } }
```

### Literal form — `KindLiteral{regexp: {source, flags}}`

Produced when the resolver **traces the call site back to a regex literal**. The emitter (`internal/emit/runtypes_module.go`) renders this as `new RegExp("…", "…")` at runtime, so consumers see a real `RegExp` instance.

```ts
reflectRuntypeId(/abc/i);                      // direct literal
reflectRuntypeId(/abc/i as const);             // AsExpression — unwrapped
const re = /abc/i;
reflectRuntypeId(re);                          // const-binding trace
getRuntypeId<typeof re>();                     // static via typeof binding
const a = /abc/i;
const b = a;
reflectRuntypeId(b);                           // chained const trace
```

Cache entry shape:

```json
{ "kind": 13, "literal": { "regexp": { "source": "abc", "flags": "i" } } }
```

### Quirks

- **`const` only.** `let`-bound regexes can be reassigned, so the initializer no longer determines the value at the call site. The trace skips non-`const` declarations.
- **`as const` is unwrapped.** A regex literal has no narrower TypeScript type to narrow to, but `/abc/i as const` is still wrapped in an `AsExpression`. The trace peels one layer so the literal-form path fires identically.
- **Chained `const` traces.** `const b = a;` where `a` is itself a `const`-bound regex literal resolves transitively.
- **AST harvest, not type harvest.** TypeScript has no regex-literal type — `/abc/i` is typed `RegExp`. So the trace is a syntactic AST walk, not a checker query. This mirrors deepkit's compiler-transform approach. The same `unwrap → typeof → identifier-to-initializer` primitive is reusable for future "named type format" patterns.

---

## Literal — `KindLiteral`

Holds a single literal value of any primitive kind (`string`, `number`, `boolean`, `bigint`, `symbol`). The `literal` field carries the value; the `flags` field tags non-JSON kinds so the emitter knows to use `BigInt("1")` / `Symbol("x")` constructors.

### Static form — always preserves the literal

```ts
getRuntypeId<'hello'>();                       // KindLiteral{"hello"}
getRuntypeId<42>();                            // KindLiteral{42}
getRuntypeId<true>();                          // KindLiteral{true}
getRuntypeId<1n>();                            // KindLiteral{1n, flags: ["bigint"]}
```

### Reflect form — `as const` matters

```ts
const v = 'hello' as const;                    // → KindLiteral{"hello"}  ✓
reflectRuntypeId(v);

const v = 'hello';                             // → KindString  (widened!)
reflectRuntypeId(v);
```

Cache entry shape:

```json
{ "kind": 13, "literal": "hello" }
```

### Quirks

- **`const` declared-type vs generic inference.** `const x = 42` has *declared type* `42` (literal), but TypeScript **widens literal types during generic type-parameter inference**. So `reflectRuntypeId(x)` — which goes through generic inference on `<T>(value: T)` — lands on `KindNumber`, not `KindLiteral{42}`. To preserve the literal, use `as const`.
- **The same widening applies to `string`, `number`, `boolean`, `bigint`.** Plain `const v = 'hello'; reflectRuntypeId(v)` widens to `KindString`.
- **`unique symbol` is the exception.** It already has its own literal type — `const sym: unique symbol = Symbol('x'); reflectRuntypeId(sym)` produces `KindLiteral` with the `symbol` flag.

---

## Enum — `KindEnum`

A TypeScript `enum` declaration. The cache entry carries the enum's name and a map of member → value, plus a derived `indexType` (`KindNumber` for numeric enums, `KindString` for string enums).

### Static form — always produces the enum

```ts
enum Color { Red = 0, Green = 1, Blue = 2 }
getRuntypeId<Color>();                         // KindEnum{Color}
```

### Reflect form — annotation is a TRAP

```ts
enum Color { Red = 0, Green = 1 }

const v = Color.Red;                           // → KindEnum{Color}   ✓
reflectRuntypeId(v);

const v: Color = Color.Red;                    // → KindLiteral{Color.Red}  ✗ COUNTERINTUITIVE
reflectRuntypeId(v);

declare const v: Color;                        // → KindEnum{Color}   ✓ fallback
reflectRuntypeId(v);
```

Cache entry shape:

```json
{
  "kind": 22,
  "typeName": "Color",
  "enum": { "Red": 0, "Green": 1 },
  "values": [0, 1],
  "indexType": { "kind": 7 }
}
```

### Quirks

- **The `: Color` annotation makes things narrower, not wider.** TypeScript narrows a `const` binding initialised from a literal enum member back to the member's literal type when the annotation is present. The unannotated form `const v = Color.Red` is what you want — declared-type widening lifts the literal member up to the parent enum.
- **This matches `deepkit/type` behaviour.** Deepkit reflects whatever the TS checker resolves, with no widen-back heuristic. Their workaround is the same: drop the annotation or use `declare const`.

---

## Date — `KindClass` (`ClassRef.Builtin = "Date"`)

`Date` is a class, not a primitive — but resolved with enough specificity that the emitter wires the cache entry to `globalThis.Date` at runtime.

```ts
getRuntypeId<Date>();
const v: Date = new Date();
reflectRuntypeId(v);
```

Cache entry shape:

```json
{ "kind": 20, "typeName": "Date", "classRef": { "builtin": "Date" } }
```

The footer assignment `t_<id>.classType = globalThis.Date` lets runtime code call `instanceof t.classType` against the actual built-in.

---

## See also

- [member-types.md](member-types.md) — single-typed members: `Array`, `Property`, `Method`.
- [collection-types.md](collection-types.md) — multi-typed containers: tuples, unions, intersections, promises, functions, object literals, classes, recursive types.
- [ARCHITECTURE.md](ARCHITECTURE.md) — overall pipeline and design.
