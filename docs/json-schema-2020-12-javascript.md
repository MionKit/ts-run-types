# JSON Schema 2020-12 JavaScript

**Dialect name:** `json-schema-2020-12-javascript`
**Version:** 0.1 — draft
**Status:** Descriptive. This document records the extension exactly as the RunTypes
source implements it today; nothing here is aspirational unless it sits under
[§9 Open points](#9-open-points), which is where every not-yet-implemented decision is
parked.
**Base dialect:** [JSON Schema draft 2020-12](https://json-schema.org/draft/2020-12/schema)

---

## 1. Introduction

### 1.1 Why the extension exists

JSON Schema describes JSON. TypeScript describes JavaScript, which is a strictly larger
domain: a `Date`, a `Map`, a `bigint`, `undefined`, a `RegExp`, a tuple whose positions
have names. RunTypes treats a plain TypeScript type, a value-first `RT.*` builder chain
and a JSON Schema document as three spellings of **one** shape, and converts between them
in place (`ts-runtypes convert --to json-schema`). A conversion that loses information is
not a conversion, so the schema spelling has to be able to say everything the other two
can say.

This dialect is that vocabulary. It adds four keywords and one host-language carrier to
draft 2020-12, and nothing else.

### 1.2 Design rules

Every rule below is observable in the implementation; they are stated here because they
constrain how the vocabulary may grow.

1. **Additive only.** No standard keyword changes meaning. The dialect only introduces
   keywords 2020-12 leaves undefined.
2. **Replace, do not modify.** `jsType` and `jsFormat` decide the whole node: a schema
   object carrying either one is read as that JavaScript type wholesale, and its sibling
   keywords are not consulted. This keeps the extension from having to define an
   interaction matrix against 55 standard keywords. `jsLabels` is the single exception
   and is a pure annotation on a tuple that `prefixItems` has already shaped.
3. **JSON-representable values only.** Every extension keyword's value is ordinary JSON.
   A construct whose *value* cannot ride JSON (a `bigint` bound, for example) does not
   get a keyword; it goes through the host-language carrier in §4.6 instead.
4. **One shape, one identity.** A dialect document denotes exactly one TypeScript type,
   and that type has the same structural identity as the equivalent type-first or
   builder-first spelling. This is what makes `type → builders → schema → type`
   round-trip without drift, and it is enforced by an identity oracle on every
   conversion leg.
5. **Refuse, never guess.** A construct the vocabulary cannot spell is reported and left
   alone. It is never approximated by a wider schema.

### 1.3 Conformance language

The key words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are to be interpreted as in
[RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).

**Implementation** means a processor that reads dialect documents. **Standard validator**
means a processor implementing draft 2020-12 and nothing more.

### 1.4 Terminology

| Term | Meaning |
| --- | --- |
| *Extension keyword* | One of the four keywords §4 defines. |
| *Carrier* | The host-language escape of §4.6, which is not a keyword. |
| *Portable document* | A document using no extension keyword and no carrier. |
| *Denoted type* | The TypeScript type a document stands for. |
| *Profile* | The set of standard-vocabulary restrictions a given implementation applies (§6). |

---

## 2. Relationship to draft 2020-12

### 2.1 The superset direction

The dialect is a **vocabulary superset**. Every keyword defined by draft 2020-12 keeps its
2020-12 meaning, and every document valid under 2020-12 is a valid dialect document
denoting the same set of instances.

An implementation MUST NOT redefine, narrow or overload a standard keyword in order to
express a JavaScript construct. Where a JavaScript construct needs saying, it gets its own
keyword.

This is a statement about the **dialect**. A given implementation may still apply a
profile that accepts less than all of 2020-12; the reference implementation's is §6.

### 2.2 The direction that is not symmetric

A dialect document read by a **standard validator** does not mean the same thing.
Draft 2020-12 tells a validator to ignore keywords it does not know, so
`{"jsType": "Date"}` reads to a standard validator as `{}` — a schema that accepts every
value. The extension keywords are assertions, and an ignored assertion is a hole.

Implementations MUST therefore treat a dialect document as unportable, and MUST offer a
way to produce portable output (§5). Emitting an extension keyword into a document that
will be consumed by a third-party validator is a correctness bug, not a compatibility
inconvenience.

### 2.3 Two carriers, two capability levels

The dialect is defined over schema **documents**, but the reference implementation reads
schema **literals embedded in TypeScript source**. That difference is load-bearing:

| Carrier | Extension keywords | Type carrier (§4.6) |
| --- | --- | --- |
| A `.json` document, or any pure-data value | available | **not** available |
| A TypeScript literal (`{…} as const`) | available | available |

`embedType` places a real TypeScript type at a schema position. A type is not data, so it
has no JSON encoding and cannot survive `JSON.stringify`. A document that uses it is a
TypeScript artifact, and an implementation MUST NOT claim it is JSON.

---

## 3. Dialect identification

Draft 2020-12's identification mechanism is `$schema` plus `$vocabulary`. The dialect
reserves:

- **Dialect URI:** `https://runtypes.pages.dev/schema/2020-12-javascript`
- **Vocabulary URI:** `https://runtypes.pages.dev/vocab/javascript`

The vocabulary contains exactly the four keywords of §4.

**Current implementation state:** the reference implementation does not yet accept either
URI. `$schema` accepts only `https://json-schema.org/draft/2020-12/schema`, and any other
value is a compile-time error; `$vocabulary` is accepted at the document root and ignored.
The extension keywords are recognised unconditionally, with no dialect declaration
required. See [§9 Open points](#9-open-points).

---

## 4. The JavaScript vocabulary

### 4.1 Evaluation order

An implementation MUST resolve a schema node in this order, stopping at the first rule
that matches:

1. **Type carrier** (§4.6) — the node is the carried type. Every keyword is ignored.
2. **`jsType`** (§4.2) — the node is that JavaScript type. Every keyword except
   `typeArguments` is ignored.
3. **`jsFormat`** (§4.3) — the node is that format-branded type. Every other keyword is
   ignored.
4. **Standard 2020-12 evaluation.** `jsLabels` (§4.5) participates here, as an annotation
   on the tuple `prefixItems` produced.

Rules 1 to 3 are mutually exclusive by construction. A node carrying more than one of
them is resolved by the order above; an implementation SHOULD warn, since the
lower-priority keywords are silently inert.

### 4.2 `jsType`

**Value:** one of the strings below.
**Applies to:** any schema position.
**Effect:** the node denotes the named JavaScript type.

| Value | Denoted type | Notes |
| --- | --- | --- |
| `"bigint"` | `bigint` | The `bigint` *type*. A bigint **literal** has no spelling here — see §4.6. |
| `"symbol"` | `symbol` | |
| `"undefined"` | `undefined` | Distinct from JSON `null`, which stays `{"type": "null"}`. |
| `"void"` | `void` | |
| `"any"` | `any` | The one type `{}` and `true` cannot spell; both of those denote `unknown`. |
| `"Date"` | `Date` | The native object. A *bounded* Date is a format, see §4.3. |
| `"RegExp"` | `RegExp` | |
| `"Map"` | `Map<K, V>` | Requires `typeArguments` of length 2. |
| `"Set"` | `Set<T>` | Requires `typeArguments` of length 1. |
| `"Promise"` | `Promise<T>` | Requires `typeArguments` of length 1. |

Rules:

- The value list is closed. An implementation MUST reject a value outside it rather than
  fall back to a wider type.
- For `Map`, `Set` and `Promise`, `typeArguments` MUST be present with the arity above. A
  missing or wrong-arity `typeArguments` denotes `never` — the node accepts nothing.
- For every other value, `typeArguments` MUST be absent. An implementation MAY ignore it.
- Sibling keywords are inert. `{"jsType": "Date", "minLength": 3}` is a `Date`; the
  `minLength` is not an error and not a check.

```json
{"jsType": "Map", "typeArguments": [{"type": "string"}, {"type": "array", "items": {"type": "number"}}]}
```

denotes `Map<string, number[]>`.

### 4.3 `typeArguments`

**Value:** an array of schemas.
**Applies to:** a node carrying `jsType` with a parameterised value.
**Effect:** supplies that type's type arguments, positionally.

Each element is a full schema position and MAY itself carry extension keywords, so
`Map<string, Set<Date>>` nests naturally. `typeArguments` on a node without a
parameterised `jsType` has no effect.

### 4.4 `jsFormat`

**Value:** `{"name": <family>, "params"?: <object>}`.
**Applies to:** any schema position.
**Effect:** the node denotes the format-branded type that exact `(name, params)` pair
stands for.

Draft 2020-12's `format` keyword names a *fixed* set of string formats and carries no
parameters. RunTypes' format system is parameterised (`{minLength: 2, maxLength: 60}`,
`{version: "4"}`, `{min: "2020-01-01"}`) and covers numbers and `Date` as well as strings.
`jsFormat` carries such an annotation verbatim, so the brand survives a round trip
without depending on a lookup table that could drift.

Defined families. The `params` column is illustrative, not a closed list: each family owns
its own params object and the keyword carries whatever that object holds.

| `name` | Base type | Params it typically holds |
| --- | --- | --- |
| `stringFormat` | `string` | `minLength`, `maxLength`, `length`, `pattern`, `allowedChars`, `disallowedChars`, `allowedValues`, `disallowedValues`, `contentEncoding`, `contentMediaType`, `mockSamples`, and the casing / trimming flags |
| `numberFormat` | `number` | `min`, `max`, `lt`, `gt`, `multipleOf`, `integer`, `float`, `isCurrency`, and the JSON spellings `minimum` / `maximum` / `exclusiveMinimum` / `exclusiveMaximum` |
| `email` | `string` | `localPart`, `domain`, `maxLength`, `emailRfc`, `mockSamples` |
| `uuid` | `string` | `version`: `"any"`, `"4"` or `"7"` |
| `ip` | `string` | the IP family's version and form params |
| `domain` | `string` | `names`, `tld`, `minParts`, `maxParts`, `minLength`, `maxLength`, `pattern` |
| `url` | `string` | `minLength`, `maxLength`, `pattern`, `mockSamples` and the URL parts |
| `date` | `string` | `min` / `max` bounds, absolute or relative (`now±P…`) |
| `time` | `string` | `min` / `max` bounds |
| `dateTime` | `string` | `min` / `max` bounds |
| `nativeDate` | `Date` | `min` / `max` bounds — a bounded `Date` object, as opposed to bare `{"jsType": "Date"}` |

Rules:

- The family list is closed. An implementation MUST reject an unknown `name`. It MUST NOT
  degrade to the base type, because a dropped format is a dropped check.
- `params` is carried **verbatim**: an implementation MUST NOT normalise, reorder
  semantically, or drop keys it does not recognise, and MUST NOT inject defaults. The
  pair is the identity.
- Every value inside `params` MUST be JSON-representable. This is why the `bigint` format
  family is deliberately absent: its bounds are `bigint` values. Those brands use the
  carrier of §4.6.
- The Temporal families are deliberately absent for a different reason: keeping them out
  means a schema document never pulls the Temporal library into a consumer's type graph.
  They use the carrier too.
- Sibling keywords are inert, as with `jsType`.

```json
{"jsFormat": {"name": "uuid", "params": {"version": "4"}}}
{"jsFormat": {"name": "stringFormat", "params": {"minLength": 2, "maxLength": 5}}}
```

### 4.5 `jsLabels`

**Value:** an array of strings.
**Applies to:** a node that denotes a tuple, that is, one carrying `prefixItems`.
**Effect:** names the tuple's positions, giving `[x: number, y: number]` rather than
`[number, number]`.

TypeScript treats slot names as part of a tuple's identity, so a labelled tuple and an
unlabelled one are different types. Without this keyword the schema form could not
express the difference and a conversion would silently rename the shape.

Rules:

- The array is **positional**: one entry per slot, in order — required slots, then
  optional slots, then the rest slot when `items` is a schema.
- The list MUST cover every slot. TypeScript labels all positions or none, so a partial
  list is not a partial labelling; an implementation MUST ignore a non-covering list
  **whole**, leaving an unlabelled tuple, rather than applying it to a prefix.
- `jsLabels` on a node that is not a tuple has no effect.
- Labels do not constrain instances. Every instance a tuple accepts, its labelled twin
  accepts.

```json
{"type": "array", "prefixItems": [{"type": "number"}, {"type": "number"}],
 "minItems": 2, "items": false, "jsLabels": ["x", "y"]}
```

denotes `[x: number, y: number]`. With a rest slot:

```json
{"type": "array", "prefixItems": [{"type": "number"}, {"type": "number"}],
 "minItems": 1, "items": {"type": "string"}, "jsLabels": ["start", "len", "rest"]}
```

denotes `[start: number, len?: number, ...rest: string[]]`.

### 4.6 The embedded-type carrier

**Not a keyword.** A schema position whose value is a host-language value carrying a type.

The reference spelling is `embedType`, from the `@ts-runtypes/core/json-schema` subpath:

```ts
import {embedType, runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

const schema = {type: 'object', properties: {id: embedType<UserId>()}} as const;
```

`embedType<T>()` returns an opaque value whose *type* carries `T`. An implementation
substitutes `T` at that node. This is the one rule that covers every construct at once,
which is why the vocabulary above can stay small: anything a schema cannot spell but
TypeScript can, rides this instead of earning a keyword.

What it carries today, in the reference implementation:

- bigint literals and bigint-parameterised format brands
- enum references and class references
- function types and template literal types
- Temporal-typed values
- objects with `readonly` members, symbol-keyed members, or a numeric or second index
  signature
- brand-metadata intersections (`string & {readonly __brand: 'email'}`)

Rules:

- The carrier MUST be available only in a host language that can hold a type. In a pure
  JSON document it does not exist, and an implementation MUST NOT invent an encoding for
  it. (Its inert runtime value serialises to `{"__rtEmbed": true}`, which carries no type
  and MUST NOT be read as one.)
- A carried type MUST be substituted verbatim. The node is exactly that type, so its
  identity is exact by construction.
- The carrier takes priority over every keyword (§4.1).
- Because the carried text is quoted TypeScript, it cannot refer back to the declaration
  currently being defined. A recursive shape reachable only through a carrier is not
  expressible; implementations MUST refuse it rather than emit a broken reference.

---

## 5. The portable subset

A **portable document** uses no extension keyword and no carrier. It is exactly a draft
2020-12 document and means the same thing to any validator.

An implementation that emits dialect documents MUST provide a portable mode. In the
reference implementation this is `ts-runtypes convert --to json-schema --portable`, which
turns every construct that would need the dialect into an error naming the construct,
rather than emitting a lossy approximation.

Under `--portable`, these become errors: `jsType` rows (`bigint`, `symbol`, `undefined`,
`void`, `any`, `Date`, `RegExp`, `Map`, `Set`, `Promise`), every `jsFormat` row,
`jsLabels`, and every use of the carrier.

---

## 6. Reference-implementation profile

§§2–5 define the dialect. This section records where the **RunTypes implementation**
additionally narrows or sharpens draft 2020-12. These are implementation policy, not part
of the dialect: another implementation could conform to the dialect without them.

The runtime scoreboard for all of this is
[`packages/ts-runtypes/test/json-schema-official/CONFORMANCE.md`](../packages/ts-runtypes/test/json-schema-official/CONFORMANCE.md),
generated from the official JSON Schema Test Suite. At the time of writing: 1988 cases,
1817 conforming, 29 by-design divergences, 0 open divergences.

### 6.1 `format` is always asserted

2020-12 makes `format` an annotation by default. RunTypes always checks it. A schema's
`format: "email"` becomes an `EmailAddress` type in the consumer's code, and a brand that
is not checked is a brand that lies. The dialect's own opt-in — a custom meta-schema
declaring the format-assertion vocabulary — lives in a second document that would have to
be fetched, so nothing in the file says which reading the author meant; checking is the
safer default, because it can only reject values a laxer validator would have accepted,
never accept ones a stricter validator would have rejected.

A `format` value the dialect does not define stays an annotation, because there is nothing
to check against.

### 6.2 Content keywords are asserted and narrowed

`contentEncoding` accepts `base64`, `base32` and `base16` only, and is enforced as an
anchored pattern. `contentMediaType` accepts `application/json` only, and is enforced as a
parse check on the decoded content. `contentSchema` is not accepted at all: validating
decoded content against a second schema has no honest single-pass story.

### 6.3 `const` and `enum` take JSON scalars only

Values are limited to `string`, `number`, `boolean` and `null`. Object and array values
are not accepted.

### 6.4 References stay inside the document

`$ref` and `$dynamicRef` resolve within the document passed, covering `#` (the root),
`#/$defs/<name>` pointers, `#name` anchors from `$anchor` / `$dynamicAnchor`, and the
root's own `$id` spelling of those. A reference to another document is rejected at the
key.

The document is read while the project builds. Following a reference out of it would put
a network fetch inside type-checking, let one source produce different types on different
machines, and leave no honest answer for a failed fetch.

`$id` is accepted at the root only and ignored; an embedded `$id` is rejected, because it
re-scopes reference resolution to a document boundary that would then have to be resolved.
`$vocabulary` is accepted at the root only and ignored. `$dynamicRef` resolves statically:
a single-resource document has exactly one candidate in the dynamic scope.

### 6.5 Unknown keywords are rejected

2020-12 says to ignore keywords it does not know. RunTypes rejects them, at the key where
they were written, at every nesting level. A misspelled `minLen` would otherwise compile
and silently drop the constraint. Along with §6.1 and §6.2 this is one of the three places
the implementation is deliberately stricter than 2020-12, and it is what makes "a
constraint accepted is a constraint enforced" true rather than aspirational.

### 6.6 `oneOf` combination limits

`oneOf` beside `not`, `if`, `dependentRequired`, `dependentSchemas` or a reference
resolves to an impossible type: combining them would require dropping the exclusivity.
The fix is to move the shared constraint into each branch.

A branch reaching through `$ref` to a definition that is itself a `oneOf` counts, in the
outer exactly-one tally, as that definition's plain union. Nested exclusivity has to be
spelled inline in the branch.

### 6.7 `unevaluatedProperties` / `unevaluatedItems`

Both are supported and enforced, but the denoted type is the plain object or array. What
they assert depends on which sibling applicators actually passed for the instance in
hand, which no static type can express, so the check rides into the generated validator
while the type stays the closest readable shape.

### 6.8 Ignored annotations

`title`, `description`, `examples`, `default`, `$comment`, `deprecated`, `readOnly` and
`writeOnly` are read and ignored at every position. `readOnly` in particular does **not**
produce a `readonly` member: the lift was tried and dropped, because it changes a type's
identity while validating nothing. A `readonly` member is spelled in TypeScript, with the
`RT.propMod({readonly: true}, …)` builder, or through the carrier.

The lint plugin warns when an ignored keyword carries intent nothing will enforce — a
`readOnly: true`, a `then` without `if`, a `minContains` without `contains`.

### 6.9 Standard keywords accepted

For completeness, the profile accepts these 2020-12 keywords, with the narrowings noted
above:

*Core and references* — `$schema`, `$id`, `$vocabulary`, `$defs`, `$ref`, `$anchor`,
`$dynamicAnchor`, `$dynamicRef`, `$comment`.

*Applicators* — `allOf`, `anyOf`, `oneOf`, `not`, `if`, `then`, `else`,
`dependentSchemas`, `properties`, `patternProperties`, `additionalProperties`,
`propertyNames`, `prefixItems`, `items`, `contains`.

*Validation* — `type`, `const`, `enum`, `multipleOf`, `maximum`, `exclusiveMaximum`,
`minimum`, `exclusiveMinimum`, `maxLength`, `minLength`, `pattern`, `maxItems`,
`minItems`, `uniqueItems`, `maxContains`, `minContains`, `maxProperties`,
`minProperties`, `required`, `dependentRequired`.

*Unevaluated* — `unevaluatedItems`, `unevaluatedProperties`.

*Content* — `contentEncoding`, `contentMediaType`.

*Format* — `format`.

*Annotations* — `title`, `description`, `default`, `deprecated`, `readOnly`, `writeOnly`,
`examples`.

Boolean schemas (`true` / `false`) are accepted at every schema position, including
`prefixItems` slots, property values and `$defs` entries.

The one 2020-12 keyword not accepted is `contentSchema` (§6.2).

---

## 7. Keyword index

| Keyword | Value | Position | Denotes |
| --- | --- | --- | --- |
| `jsType` | closed string enum | any | a JavaScript type 2020-12 cannot spell |
| `typeArguments` | array of schemas | beside a parameterised `jsType` | that type's type arguments |
| `jsFormat` | `{name, params?}` | any | a parameterised format brand, carried verbatim |
| `jsLabels` | array of strings | a tuple node | the tuple's slot names |
| *(carrier)* | host-language value | any, TypeScript only | an arbitrary TypeScript type |

---

## 8. Worked example

A TypeScript declaration:

```ts
type Session = {
  id: string;
  token: bigint;
  issued: Date;
  scopes: Set<'read' | 'write'>;
  window: [start: number, len?: number];
  claims: Map<string, string>;
};
```

converts to the dialect with `ts-runtypes convert --to json-schema` as (reflowed here for
reading; the tool emits the literal on one line):

```ts
import {type InferType} from '@ts-runtypes/core';
import {runTypeFromJsonSchema} from '@ts-runtypes/core/json-schema';

export const sessionRT = runTypeFromJsonSchema({
  type: 'object',
  properties: {
    id: {type: 'string'},
    token: {jsType: 'bigint'},
    issued: {jsType: 'Date'},
    scopes: {jsType: 'Set', typeArguments: [{enum: ['read', 'write']}]},
    window: {
      type: 'array',
      prefixItems: [{type: 'number'}, {type: 'number'}],
      minItems: 1,
      items: false,
      jsLabels: ['start', 'len'],
    },
    claims: {jsType: 'Map', typeArguments: [{type: 'string'}, {type: 'string'}]},
  },
  required: ['id', 'token', 'issued', 'scopes', 'window', 'claims'],
} as const);
export type Session = InferType<typeof sessionRT>;
```

Five of the six properties need the dialect, so `--portable` refuses the declaration
rather than emitting a schema that would quietly accept anything for them:

```
CNV006 error [Session]: bigint has no standard 2020-12 spelling;
drop --portable to use the RunTypes dialect
```

The `embedType` import appears only when a construct from §4.6 is present — a `Session`
carrying, say, a branded `UserId` would import it.

---

## 9. Open points

Decisions this document has surfaced but the implementation has not yet made. Each one
would change the spec, not just the code.

1. **Dialect declaration.** §3 reserves a `$schema` and a `$vocabulary` URI that nothing
   accepts yet. Deciding whether a dialect document *must* declare itself is the main
   open question: requiring it makes an unportable document self-describing, but breaks
   every document already emitted. A middle option is to accept the dialect URI, keep
   accepting the plain 2020-12 URI, and warn when extension keywords appear under the
   latter.
2. **A published meta-schema.** The dialect has no machine-readable meta-schema. One would
   let third-party tooling at least *recognise* the keywords, and would give the reserved
   vocabulary URI something to resolve to.
3. **Keyword prefix.** The keywords are unprefixed (`jsType`, not `x-jsType` or
   `runtypes:jsType`). That reads well and matches how 2020-12 vocabularies name their
   own keywords, but it does risk colliding with a future standard keyword or another
   extension. Worth settling before the vocabulary is published anywhere.
4. **`jsType` coverage.** `WeakMap`, `WeakSet`, typed arrays, `ArrayBuffer`, `Error` and
   the Temporal types are not in the enum. Temporal is a deliberate exclusion (§4.4); the
   rest are simply unreached. Each one is a keyword-value decision, not a mechanism
   change.
5. **`readonly` members.** Today they go through the carrier, which escapes the *whole*
   object (§6.8). A `jsPropMods`-style keyword would keep such objects in pure data. The
   cost is a keyword that every object translation has to consult, which is exactly the
   tax §1.2 rule 2 was written to avoid.
6. **`jsFormat` and the standard keywords.** A `stringFormat` brand carrying only
   `minLength` and `maxLength` is expressible as standard `minLength` / `maxLength`, but
   is currently emitted as `jsFormat` regardless. Lowering the standard-expressible
   subset would widen what `--portable` can carry.
7. **Extension keywords in `$defs` and behind `$ref`.** The interaction is well defined
   (an extension keyword is resolved at its own node, wherever that node sits), but there
   is no test pinning a `jsType` reached through a `$ref` chain.

---

## Sources in the tree

The normative behaviour above lives in these files. When they change, this document is
wrong until it is updated.

- [`packages/ts-runtypes/src/json-schema/fromJsonSchema.ts`](../packages/ts-runtypes/src/json-schema/fromJsonSchema.ts)
  — the accepted input surface (`JsonSchemaInput`, `JsTypeName`, `JsFormatName`), the
  keyword-to-meaning translation, and `SchemaLoweringByKeyword`, a machine-checked table
  that fails to compile if any accepted keyword lacks a row.
- [`packages/ts-runtypes/src/json-schema/embedType.ts`](../packages/ts-runtypes/src/json-schema/embedType.ts)
  — the carrier.
- [`packages/ts-runtypes/src/json-schema/runTypeFromJsonSchema.ts`](../packages/ts-runtypes/src/json-schema/runTypeFromJsonSchema.ts)
  — the entry point and its exactness guard.
- [`ts-go-runtypes/internal/convert/print.go`](../ts-go-runtypes/internal/convert/print.go)
  — the emitter, including every `--portable` refusal.
- [`packages/ts-runtypes/test/json-schema-official/`](../packages/ts-runtypes/test/json-schema-official/)
  — the official-suite conformance lane and its divergence ledger.
- [`container/website/content/02.guide/02.json-schema.md`](../container/website/content/02.guide/02.json-schema.md)
  — the user-facing keyword tables.
