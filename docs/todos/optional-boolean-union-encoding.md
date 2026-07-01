# Audit the generated code for the playground examples (found: optional `boolean` encoded as a union)

Status: **open — to investigate.** Reported from the playground "Generated Cache"
view. Scope: resolver / type graph + the compiled fn families (validate `val`,
errors `verr`, JSON `pjs`/`rj`, binary `tb`/`fb`). NOT a playground issue (the
playground just surfaced the generated code).

## Goal

Build the compiled functions for **every playground preset** (below), in **both**
the TS-type and value-first schema forms, across every `createX` family, read the
generated code, and flag anything that looks wrong or wasteful. The optional-boolean
case below is the **first** issue found (from the `Simple` preset); the task is to
sweep all of them for more.

## Finding #1 — optional `boolean` property is encoded as a union

An **optional boolean** property (`active?: boolean`, from the `Simple` preset) is
compiled as if it were a 3-member **union** `undefined | false | true` and encoded
with discriminated-union logic (a per-arm predicate walk that emits
`[armIndex, value]` / a discriminant byte). A required boolean (`active: boolean`)
compiles cleanly with no union handling. The union treatment is unnecessary:
`active?: boolean` needs only the normal optional-property presence check plus a
plain boolean value — the object walker already emits `if (v.active !== undefined)
…`, so the extra union encode of the value is pure overhead (bytes, wire size, and
a misleading error path).

Suspected to have been introduced (or exposed) by recent JSON-compact / composite
codec work, but that is unconfirmed — see **Investigation** below.

## Reproduction

Two minimal types (the second is the same field made required, as a contrast):

```ts
type MyType = { active?: boolean };   // BAD: encoded as a union
type MyType = { active: boolean };    // GOOD: clean, no union
```

## Observed generated code

Captured from the resolver via the playground engine (`emitMode: functions`,
`inlineMode: allInternal`, `moduleMode: allSingle`). The union treatment is
resolver-level, so it is expected to reproduce under the default plugin config
too — confirm that as step 1.

### `active?: boolean` — JSON encoder (`createJsonEncoder` → `pjs`)

`active` is resolved as a union of three `val` members (`v === false`,
`v === true`, `typeof v === 'undefined'`) and encoded as `[armIndex, value]`:

```js
// virtual:rt/fns/pjs.js
const CiE_zxt3nZt = utl.getRT('CiE_zxt3nZt'); // typeof v === 'undefined'
const CiE_O6gS6gC = utl.getRT('CiE_O6gS6gC'); // v === false
const CiE_jf9vtBd = utl.getRT('CiE_jf9vtBd'); // v === true
const fuEncErr = 'Can not json encode union: item does not belong to the union';
const ctxFn0 = function (v) {
  if (CiE_zxt3nZt?.fn(v.active) ?? true) return [0, v.active];
  if (CiE_O6gS6gC?.fn(v.active) ?? true) return [1, v.active];
  if (CiE_jf9vtBd?.fn(v.active) ?? true) return [2, v.active];
  throw new Error(fuEncErr);
};
const ctxFn1 = function (v) {
  const _r = {};
  if (v.active !== undefined) _r['active'] = ctxFn0(v); // presence check ALREADY here
  return _r;
};
```

The three `val` members it depends on:

```js
// virtual:rt/fns/val.js
export const __rt_CiE_O6gS6gC = ['val', , , 'CiE_O6gS6gC', 'literal', …, function (utl){ return (v) => v === false }];
export const __rt_CiE_jf9vtBd = ['val', , , 'CiE_jf9vtBd', 'literal', …, function (utl){ return (v) => v === true }];
export const __rt_CiE_zxt3nZt = ['val', , , 'CiE_zxt3nZt', 'undefined', …, function (utl){ return (v) => typeof v === 'undefined' }];
```

### `active?: boolean` — binary encoder (`createBinaryEncoder` → `tb`)

Same union treatment: writes a discriminant byte (0/1/2) per arm. Note it also
reuses the JSON error string (`'Can not json encode union: …'`) in the binary
encoder — a secondary bug:

```js
// virtual:rt/fns/tb.js
const fuEncErr = 'Can not json encode union: item does not belong to the union';
function Ass(v, Ser) {
  const bmI0 = Ser.index;
  Ser.ensureCapacity?.(1); Ser.view.setUint8(Ser.index++, 0);
  if (v.active !== undefined) {
    if (CiE_zxt3nZt?.fn(v.active) ?? true) { …setUint8(…, 0); …setUint8(…, 1); }
    else if (CiE_O6gS6gC?.fn(v.active) ?? true) { …setUint8(…, 1) }
    else if (CiE_jf9vtBd?.fn(v.active) ?? true) { …setUint8(…, 2) }
    else { throw new Error(fuEncErr) };
    Ser.setBitMask(bmI0, 0);
  }
  return Ser;
}
```

### `active: boolean` — JSON encoder (contrast, CORRECT)

No union, no per-arm predicates — the boolean value flows straight through:

```js
// virtual:rt/fns/pjs.js
function v3N(v) {
  if (Object.keys(v).length === 1) return v;
  return { active: v.active };
}
```

## Why this is wrong

`active?: boolean` should encode as "optional property (presence check) + plain
boolean value". The required-boolean output already shows the boolean needs no
special encoding. The optional variant instead widens `boolean` into its literal
members `true | false`, adds `undefined`, and treats the result as a discriminated
union — so every optional boolean pays for a predicate walk + a discriminant on
the wire, for no benefit.

## Suspected cause / where to look

Likely the optional widens `boolean` into `boolean | undefined` = `true | false |
undefined`, and that 3-member literal union is then handled by the generic union
encode arm rather than being recognized as "optional boolean". Places to check:

- How the type graph represents `active?: boolean`: does the optional marker widen
  `boolean` into `true | false | undefined` (a union node) instead of keeping an
  atomic boolean + an optional flag on the property?
- The union vs atomic decision for `boolean` (which is `true | false`) — is a bare
  `boolean` kept atomic while `boolean | undefined` collapses to a literal union?
  See the runtype builders / union normalization and `internal/compiled/runtype/`.
- The JSON encoder (`pjs`) and binary encoder (`tb`) emit arms in
  `internal/compiled/typefns/` — confirm whether they receive a union node here
  and whether an "optional atomic" fast path exists / is being missed.
- Whether the recent JSON-composite / compact work changed how optional (or
  `undefined`-bearing) members are lowered.

## Examples to sweep (playground presets)

These are the six presets from `packages/runtypes-playground/src/element/presets.ts`,
each in both forms. Generate every `createX` family for each (both forms) and read
the output. `MyType` is the resolved root in both forms (`createX<MyType>()` for the
TS form, `createX(MyType)` for the schema form).

### Simple

```ts
type MyType = {
  id: number;
  name: string;
  tags: string[];
  active?: boolean;
};
```

```ts
import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.number(),
  name: TF.string(),
  tags: RT.array(TF.string()),
  active: RT.optional(RT.boolean()),
});
```

### User

```ts
import * as TF from 'ts-runtypes/formats';

type MyType = {
  id: TF.UUIDv4;
  email: TF.Email;
  name: string;
  age?: TF.PositiveInt;
  roles: ('admin' | 'editor' | 'user')[];
  active: boolean;
  createdAt: string;
};
```

```ts
import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.uuidv4(),
  email: TF.email(),
  name: TF.string(),
  age: RT.optional(TF.positiveInt()),
  roles: RT.array(RT.union([RT.literal('admin'), RT.literal('editor'), RT.literal('user')])),
  active: RT.boolean(),
  createdAt: TF.string(),
});
```

### Order

```ts
import * as TF from 'ts-runtypes/formats';

type MyType = {
  id: string;
  customer: { id: number; email: TF.Email };
  items: { sku: string; name: string; qty: number; price: TF.Positive }[];
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled';
  total: TF.Positive;
  note?: string;
};
```

```ts
import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.string(),
  customer: RT.object({ id: TF.number(), email: TF.email() }),
  items: RT.array(
    RT.object({ sku: TF.string(), name: TF.string(), qty: TF.number(), price: TF.positive() })
  ),
  status: RT.union([
    RT.literal('pending'),
    RT.literal('paid'),
    RT.literal('shipped'),
    RT.literal('delivered'),
    RT.literal('cancelled'),
  ]),
  total: TF.positive(),
  note: RT.optional(TF.string()),
});
```

### BlogPost

```ts
import * as TF from 'ts-runtypes/formats';

type MyType = {
  id: number;
  title: string;
  slug: string;
  tags: string[];
  author: { name: string; email: TF.Email };
  published: boolean;
  meta: { views: TF.Integer; likes: TF.Integer };
};
```

```ts
import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.number(),
  title: TF.string(),
  slug: TF.string(),
  tags: RT.array(TF.string()),
  author: RT.object({ name: TF.string(), email: TF.email() }),
  published: RT.boolean(),
  meta: RT.object({ views: TF.integer(), likes: TF.integer() }),
});
```

### Product

```ts
import * as TF from 'ts-runtypes/formats';

type MyType = {
  id: string;
  name: string;
  price: TF.Positive;
  url: TF.Url;
  currency: 'USD' | 'EUR' | 'GBP';
  inStock: boolean;
  categories: string[];
};
```

```ts
import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.object({
  id: TF.string(),
  name: TF.string(),
  price: TF.positive(),
  url: TF.url(),
  currency: RT.union([RT.literal('USD'), RT.literal('EUR'), RT.literal('GBP')]),
  inStock: RT.boolean(),
  categories: RT.array(TF.string()),
});
```

### Tree (recursive)

```ts
type MyType = {
  id: number;
  name: string;
  children: MyType[];
};
```

```ts
import * as RT from 'ts-runtypes/schema';
import * as TF from 'ts-runtypes/formats';

const MyType = RT.circular((self) =>
  RT.object({
    id: TF.number(),
    name: TF.string(),
    children: RT.array(self),
  })
);
```

## Investigation (part of this TODO — not yet done)

0. **Sweep every preset above** (both forms) across all `createX` families
   (`createValidate`, `createGetValidationErrors`, `createJsonEncoder`,
   `createJsonDecoder`, `createBinaryEncoder`, `createBinaryDecoder`,
   `getRunType`), generate the code, read it, and record anything wrong or wasteful
   (union encoding where none is needed, redundant checks, wrong error strings,
   TS-form vs schema-form divergence, format-aware fields, the recursive `Tree`
   case). Finding #1 is the seed; add findings #2, #3, … here.
1. Reproduce with the **default** plugin config (not just the playground's
   `functions`/`allInternal`/`allSingle`) via a Go fixture / `bin/ts-runtypes`
   transform, to confirm findings are not playground-specific.
2. Confirm the scope of the widening:
   - `active?: boolean` vs `active: boolean` (shown above).
   - Other optional primitives: `active?: string`, `active?: number` — does
     `T | undefined` also trigger union encoding, or is `boolean` special because
     it is `true | false`?
   - A genuine optional union (`x?: 'a' | 'b'`) for comparison — that one legitimately
     needs union encoding; the boolean case should not.
   - Validate / `getValidationErrors` and the decoders (`rj` / `fb`) — does the
     union treatment leak there too, or only the encoders?
3. Decide the fix: keep the optional boolean atomic (presence check + plain value)
   rather than lowering it to a `true | false | undefined` union.
4. Fix the secondary bug: the binary encoder reuses the JSON union error message
   (`'Can not json encode union: …'`); it should have a binary-specific message.
5. Add fixtures / fuzz coverage: optional primitives should round-trip without
   union encoding; a regression test that the generated encoder for `active?:
   boolean` contains no discriminant / union-arm logic.
