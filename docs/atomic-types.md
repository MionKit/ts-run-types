# Atomic types

This document describes every **atomic** `ReflectionKind` the resolver produces — primitives, regex, literals, enums, and `Date`. Member kinds (`array`, `tuple`, `union`, `class`, `objectLiteral`, …) live in [member-types.md](member-types.md).

Each section shows:

- what TS source produces the kind,
- both call forms (`getRunTypeId<T>()` static, `reflectRunTypeId(v)` reflection),
- the shape of the resulting cache entry.

Two sections — **Literal** and **Enum** — also call out TypeScript quirks where the call shape changes the resulting `Kind` in surprising ways.

> **Marker test coverage rule.** Every scenario below has paired tests in [`internal/resolver/atomic_test.go`](../internal/resolver/atomic_test.go) and [`packages/vite-plugin-runtypes/test/atomic.test.ts`](../packages/vite-plugin-runtypes/test/atomic.test.ts) — one per call form. See `CLAUDE.md`.

---

## Primitives

The simplest entries — `Kind` is set, no payload. The static form uses an explicit type argument; the reflection form annotates the binding so TS doesn't widen.

### String — `KindString`

```ts
getRunTypeId<string>(); // static
declare const v: string;
reflectRunTypeId(v); // reflect
```

### Number — `KindNumber`

```ts
getRunTypeId<number>();
const v: number = 42;
reflectRunTypeId(v);
```

### Boolean — `KindBoolean`

```ts
getRunTypeId<boolean>();
declare const v: boolean;
reflectRunTypeId(v);
```

### BigInt — `KindBigInt`

```ts
getRunTypeId<bigint>();
const v: bigint = 1n;
reflectRunTypeId(v);
```

### Symbol — `KindSymbol`

```ts
getRunTypeId<symbol>();
const v: symbol = Symbol('x');
reflectRunTypeId(v);
```

### Null / Undefined / Void — `KindNull` / `KindUndefined` / `KindVoid`

```ts
getRunTypeId<null>();
getRunTypeId<undefined>();
getRunTypeId<void>();
```

### Any / Unknown / Never — `KindAny` / `KindUnknown` / `KindNever`

```ts
getRunTypeId<any>();
getRunTypeId<unknown>();
getRunTypeId<never>();
```

### Object — `KindObject`

The TypeScript `object` primitive (any non-primitive). Distinct from `KindObjectLiteral`.

```ts
getRunTypeId<object>();
const v: object = {};
reflectRunTypeId(v);
```

---

## RegExp

Two outcomes depending on whether the resolver can trace the marker call back to a regex-literal source expression.

### Instance form — `KindRegexp` (`ClassRef.Builtin = "RegExp"`)

Produced when **no regex literal is reachable** from the call site. Examples:

```ts
getRunTypeId<RegExp>(); // explicit type
declare const re: RegExp; // no initializer
reflectRunTypeId(re);
let re = /abc/i; // `let` — not traced
reflectRunTypeId(re);
```

Cache entry shape:

```json
{"kind": 12, "classRef": {"builtin": "RegExp"}}
```

### Literal form — `KindLiteral{regexp: {source, flags}}`

Produced when the resolver **traces the call site back to a regex literal**. The emitter (`internal/emit/runtypes_module.go`) renders this as `new RegExp("…", "…")` at runtime, so consumers see a real `RegExp` instance.

```ts
reflectRunTypeId(/abc/i); // direct literal
reflectRunTypeId(/abc/i as const); // AsExpression — unwrapped
const re = /abc/i;
reflectRunTypeId(re); // const-binding trace
getRunTypeId<typeof re>(); // static via typeof binding
const a = /abc/i;
const b = a;
reflectRunTypeId(b); // chained const trace
```

Cache entry shape:

```json
{"kind": 13, "literal": {"regexp": {"source": "abc", "flags": "i"}}}
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
getRunTypeId<'hello'>(); // KindLiteral{"hello"}
getRunTypeId<42>(); // KindLiteral{42}
getRunTypeId<true>(); // KindLiteral{true}
getRunTypeId<1n>(); // KindLiteral{1n, flags: ["bigint"]}
```

### Reflect form — `as const` matters

```ts
const v = 'hello' as const; // → KindLiteral{"hello"}  ✓
reflectRunTypeId(v);

const v = 'hello'; // → KindString  (widened!)
reflectRunTypeId(v);
```

Cache entry shape:

```json
{"kind": 13, "literal": "hello"}
```

### Quirks

- **`const` declared-type vs generic inference.** `const x = 42` has _declared type_ `42` (literal), but TypeScript **widens literal types during generic type-parameter inference**. So `reflectRunTypeId(x)` — which goes through generic inference on `<T>(value: T)` — lands on `KindNumber`, not `KindLiteral{42}`. To preserve the literal, use `as const`.
- **The same widening applies to `string`, `number`, `boolean`, `bigint`.** Plain `const v = 'hello'; reflectRunTypeId(v)` widens to `KindString`.
- **`unique symbol` is the exception.** It already has its own literal type — `const sym: unique symbol = Symbol('x'); reflectRunTypeId(sym)` produces `KindLiteral` with the `symbol` flag.

---

## Enum — `KindEnum`

A TypeScript `enum` declaration. The cache entry carries the enum's name and a map of member → value, plus a derived `indexType` (`KindNumber` for numeric enums, `KindString` for string enums).

### Static form — always produces the enum

```ts
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
getRunTypeId<Color>(); // KindEnum{Color}
```

### Reflect form — all three shapes work

```ts
enum Color {
  Red = 0,
  Green = 1,
}

const v = Color.Red; // → KindEnum{Color}   ✓
reflectRunTypeId(v);

const v: Color = Color.Red; // → KindEnum{Color}   ✓
reflectRunTypeId(v);

declare const v: Color; // → KindEnum{Color}   ✓
reflectRunTypeId(v);
```

Cache entry shape:

```json
{
  "kind": 22,
  "typeName": "Color",
  "enum": {"Red": 0, "Green": 1},
  "values": [0, 1],
  "indexType": {"kind": 7}
}
```

### Quirks

- **Annotation honoring.** TypeScript's control-flow analysis narrows a `const v: Color = Color.Red` binding's apparent type to the literal member `Color.Red` — which would otherwise produce a literal-only validator. The resolver reads the written annotation directly via `getTypeFromTypeNode` in the reflect form, so all three shapes above resolve to the same `KindEnum{Color}` hash. Without this, the trio would diverge: only `const v = Color.Red` (where enum-member widening kicks in) and `declare const v: Color` would produce the parent-enum hash.
- **This is a divergence from `deepkit/type`.** Deepkit reflects whatever the TS checker resolves, with no annotation-walk. Their workaround is to drop the annotation or use `declare const`. We honor the annotation at the resolver level, so the natural `const v: T = literal` idiom works in every paired test.

---

## Date — `KindClass` (`ClassRef.Builtin = "Date"`)

`Date` is a class, not a primitive — but resolved with enough specificity that the emitter wires the cache entry to `globalThis.Date` at runtime.

```ts
getRunTypeId<Date>();
const v: Date = new Date();
reflectRunTypeId(v);
```

Cache entry shape:

```json
{"kind": 20, "typeName": "Date", "classRef": {"builtin": "Date"}}
```

The footer assignment `t_<id>.classType = globalThis.Date` lets runtime code call `instanceof t.classType` against the actual built-in.

---

## See also

- [member-types.md](member-types.md) — single-typed members: `Array`, `Property`, `Method`.
- [collection-types.md](collection-types.md) — multi-typed containers: tuples, unions, intersections, promises, functions, object literals, classes, recursive types.
- [ARCHITECTURE.md](ARCHITECTURE.md) — overall pipeline and design.
