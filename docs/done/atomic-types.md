# Atomic types

> _Resurfaced historical doc, kept as a record of implemented work. Project names have changed since: `ts-go-run-types` / `@mionjs/ts-go-run-types` is now `ts-runtypes`, the `vite-plugin-runtypes` plugin is now `ts-runtypes-devtools`, and `reflectRunTypeId(value)` is now `getRunTypeId(value)`. Some paths and symbols below may since have been renamed, removed, or ported to Go._

This document describes every **atomic** `ReflectionKind` the resolver produces — primitives, regex, literals, enums, and `Date`. Member kinds (`array`, `tuple`, `union`, `class`, `objectLiteral`, …) live in [member-types.md](member-types.md).

Each section shows:

- what TS source produces the kind,
- both call forms (`getRunTypeId<T>()` static, `reflectRunTypeId(v)` reflection),
- the shape of the resulting cache entry.

Two sections — **Literal** and **Enum** — also call out TypeScript quirks where the call shape changes the resulting `Kind` in surprising ways.

> **Marker test coverage rule.** Every scenario below has paired tests in [`internal/compiler/resolver/atomic_test.go`](../internal/compiler/resolver/atomic_test.go) and [`packages/vite-plugin-runtypes/test/atomic.test.ts`](../packages/vite-plugin-runtypes/test/atomic.test.ts) — one per call form. See `CLAUDE.md`.

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

Always `KindRegexp` (`ClassRef.Builtin = "RegExp"`) — matches any `RegExp` instance.

TypeScript has **no literal type for `RegExp`**: `/abc/i` widens to `RegExp` even under `as const`. So there is deliberately no "specific source/flags" form — `typeof /abc/i`, `typeof /xyz/`, and `RegExp` are the same type and resolve to the same id (id ≡ f(T)). The regex literal is **not** harvested from the AST.

```ts
getRunTypeId<RegExp>(); // explicit type
const re = /abc/i;
reflectRunTypeId(re); // any RegExp instance
reflectRunTypeId(/abc/i); // also just RegExp — the literal is not harvested
```

Cache entry shape:

```json
{"kind": 12, "classRef": {"builtin": "RegExp"}}
```

To validate a **string** against a regex pattern, use the string-format `pattern` (`string({pattern: {source, flags, mockSamples}})` / `FormatString<{pattern}>`) — a separate feature, see [value-first-formats.md](value-first-formats.md).

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
