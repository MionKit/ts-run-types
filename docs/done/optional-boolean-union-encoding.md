# Audit the generated code for the playground examples (found: optional `boolean` encoded as a union)

Status: **DONE (shipped).** The reported artifact and every substantive finding are
fixed and verified (full JS + Go + fuzz suites green). Reported from the playground
"Generated Cache" view. Scope: resolver / type graph + the compiled fn families
(validate `val`, errors `verr`, JSON `pjs`/`rj`, binary `tb`/`fb`). NOT a playground
issue (the playground just surfaced the generated code). Full sweep + root causes in
**[Investigation results](#investigation-results-completed)** at the bottom of this file.

## Shipped

| Finding | Fix | Commit |
|---------|-----|--------|
| **A** — optional union-typed prop → discriminated-union envelope (properties, tuple slots, params, incl. `T\|null`; boolean restored to atomic) | `typeid.ResolveOptionalChild` at every optional site; synthetic union for the `T\|null` case | `fix(resolver): strip redundant undefined from optional members` |
| **B/C** — encode-side keeps a per-member dispatch for all-JSON-identity unions; boolean not atomic | `atomicOnlyJsonIdentity` early-out in the JSON encoders (pj/pjs/sj/cj) | `fix(typefns): collapse all-JSON-identity unions on encode` |
| **E** — binary encoder reuses the JSON union error string | binary-specific `flatUnionEncodeBinaryErrorVar` | (same as B) |
| **F** — schema-form `RT.circular(self)` spurious CTA001 | function-free `circular(body)` + `self()` marker; MKR001 schema-builder exclusion | `feat(schema): function-free circular(body)` |
| **record-union envelope elision** — a union whose members ALL round-trip raw (incl. object/record members) still wrapped in `[-1, merged]` / `[armIndex, value]` on JSON. e.g. `Record<string, number> \| {type; isTypeError: true}` shipped a full dispatch + envelope + `rj` module even though decode was empty | `roundTripsRaw` generalises `atomicOnlyJsonIdentity`: `AtomicNeedsTuple = !roundTripsRaw` so the object branch drops its wrap when no member needs a transform; JSON only (binary keeps its discriminant); `ukuWire` adapts to strip the bare object; `unionJsonNoop` restore mirrors it | `fix(typefns): elide JSON union envelope when every member round-trips raw` |
| tuple optional-slot id collision (regression from A) | `#optional` suffix in the tuple slot id | `fix(typeid): encode optional flag in tuple-slot id` |
| FE + Go regression coverage | `OptionalUnionEncoding.test.ts` + `RecordUnionEncoding.test.ts` (no top-level or nested `[index,value]` envelope; Date-member contrast keeps it; safe decoder still strips) + `union_flat_layout` / `unknownkeys_union` Go tests | `test(serialization): …` |

**Verified:** ts-runtypes + devtools JS suites green (7472 passed / 31 skipped),
Go `./internal/...` + `./cmd/...` 0 fail, `go vet` clean, fuzz (core suite + 706k-run
value round-trip soak, 0 violations; the type-fuzz soak's only findings are pre-existing
`O4/junk` record `validate`/`getValidationErrors` flakes reproduced identically on the
pre-change binary — unrelated to this work).

**Remaining (explicitly optional, non-blocking — see the fix plan below):** **D** (a
required `T | undefined` union still tuple-wraps genuinely non-JSON-compatible members —
narrower now after the record-union elision; deferred, rare), **G** (the
`prepareForJsonSafe` root `return ctxFn0(v)` forwarder — a one-hop polish), and
**H** (a build-time warning when a comptime option is passed in the value slot — DX nicety).
None is the reported issue or a correctness bug.

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

## Investigation (part of this TODO — done; see results below)

0. **Sweep every preset above** (both forms) across all `createX` families
   (`createValidate`, `createGetValidationErrors`, `createJsonEncoder`,
   `createJsonDecoder`, `createBinaryEncoder`, `createBinaryDecoder`,
   `getRunType`), generate the code, read it, and record anything wrong or wasteful
   (union encoding where none is needed, redundant checks, wrong error strings,
   TS-form vs schema-form divergence, format-aware fields, the recursive `Tree`
   case). Finding #1 is the seed; add findings #2, #3, … here. — **DONE**
1. Reproduce with the **default** plugin config (not just the playground's
   `functions`/`allInternal`/`allSingle`) via a Go fixture / `bin/ts-runtypes`
   transform, to confirm findings are not playground-specific. — **DONE** (all
   findings are resolver/emitter-level, reproduced straight off `bin/ts-runtypes`,
   independent of the playground).
2. Confirm the scope of the widening. — **DONE**: it is NOT boolean-specific.
   `active?: string` / `active?: number` (single-member optionals) are CLEAN; the
   defect fires for **any optional whose declared type is a union of ≥2 members**
   (`boolean` = `true | false`, `'a' | 'b'`, `string | number`, `boolean | null`).
   A genuine optional union (`x?: 'a' | 'b'`) does NOT actually need a wire
   envelope either (its members are JSON-identity). Validate, `getValidationErrors`,
   and the decoders (`rj`/`cjr`/`fb`) all inherit the union treatment.
3. Decide the fix — see finding **A** below (fix `StripUndefined`).
4. Fix the secondary bug (binary reuses the JSON union error message) — finding **E**.
5. Add fixtures / fuzz coverage — see [Recommended fix order](#recommended-fix-order).

---

## Investigation results (completed)

Method: cloned the `tsgolint` submodule (blocked by the default git-proxy rewrite;
used the project's sanctioned direct-HTTPS bypass, `GIT_CONFIG_GLOBAL=/dev/null`),
built `bin/ts-runtypes`, and drove it directly over its `--inline-server` JSON
protocol (NO playground). Generated and read the emitted per-family virtual
modules for all **6 presets in BOTH forms + 11 synthetic probes** (410 files),
importing the real `ts-runtypes` src for full fidelity, then root-caused every
artifact in the Go source. A panel of high-reasoning agents swept the output and
adversarially verified each finding against the generated code + Go source. Every
finding below is CONFIRMED against verbatim generated output.

### The headline

The reported `active?: boolean` artifact is real and **generalizes far beyond
boolean**. It is the intersection of **three independent defects** (A, C, D). An
optional single-member primitive (`x?: string`, `age?: PositiveInt`) is clean; the
trouble is any optional (or `undefined`-bearing) **union**. The user's hunch that
the recent *json-compact* work caused it is understandable but **incorrect**: the
compact codec (`json_compact.go`, commit `c268516`) is clean and merely *inherits*
the pre-existing lowering (finding A3). The root causes live in the type-graph
projection (`StripUndefined`) and the union emitters, all of which predate compact.

### Findings table

| ID | Sev | Class | What | Root cause (Go) |
|----|-----|-------|------|-----------------|
| **A** | **High** | Bug | Optional union-typed prop lowered to a `[armIndex, value]` discriminated union: +4 `val` entries, +2 modules (`pj`/`rj`), a **dead undefined arm** in every encoder (`pjs`/`pj`/`sj`/`cj`/`tb`) and dead `arm-0` in every decoder (`rj`/`cjr`/`fb`). Changes the **external JSON**: `{active:false}` → `{"active":[1,false]}`. Binary grows 1→3 bytes/elem. `verr` mislabels the field as `'union'`. | `typeid.go:562` `StripUndefined` only collapses the exact 2-member `T\|undefined` case (`len(kept)==1`); for `boolean\|undefined` = `{true,false,undefined}` it returns the **original** union with `undefined` still in it. |
| A2 | Low | Bug (symptom of A) | Validator double-checks undefined: `v.x === undefined \|\| (typeof v.x === 'undefined' \|\| …)`. | same as A (child union keeps `undefined`). |
| A3 | Low | Bug (symptom of A) | Compact `cj`/`cjr` carry the dead arm + `null` sentinel + envelope; a `cjr` module is emitted only to unwrap it. | same as A; compact needs no fix of its own. |
| A4 | Low | Bug (symptom of A) | The whole envelope recurs one level deep for `{inner:{active?}}` and per-element for `{list:{active?}[]}`. | same as A. |
| **B** | **Med** | Inefficiency | **Required** all-identity unions (`status:'pending'\|…`, `currency:'USD'\|…`, `roles`) emit an N-arm validator dispatch where **every arm returns the input unchanged**, pulling in N `val` deps + a throw — while the **decode** side already collapses to identity. Asymmetric. | `union_flat.go:123` `emitUnionPrepareForJsonFlat` / `json_prepare_safe.go:796` have no all-identity early-out; `union_flat.go:294` (decode) does. |
| **C** | **Med** | Inefficiency | `boolean` (`true\|false`) is never collapsed to `typeof === 'boolean'` inside a union — always `v === false \|\| v === true` + two literal `val` entries + two arms. Independent of optionality (fires for required `boolean\|null` too). | `serialize.go:660` union case distributes via `tsType.Distributed()`, which splits `boolean` into two `BooleanLiteral` members; `finalizeUnion` never recombines them. |
| **D** | **Med** | Inefficiency | All-or-nothing tuple rule: once ANY atomic member is non-JSON-compatible (here `undefined`), the WHOLE union is wrapped in `[idx,value]`, so the JSON-identity members (`false`/`true`) get needless explicit wire indices. | `union_flat_layout.go:191` sets `AtomicNeedsTuple` for the whole union if any member fails `isJsonCompatible`. |
| **E** | Low | Bug | Binary `toBinary` throws the **JSON** message `'Can not json encode union: …'`. Present in every union-bearing `tb` (required + optional + array). | `union_flat_binary.go:187` reuses `flatUnionEncodeErrorVar` (`union_flat.go:49`). |
| **F** | Med | Bug | Schema form only: `RT.circular((self) => … RT.array(self))` emits a spurious **CTA001 Error** diagnostic on `self`, though codegen succeeds. `tree-ts` is clean. | `scan.go` `checkCompTimeArgs` classifies the `self` identifier as a non-literal `CompTimeArgs` leaf → `CodeCompTimeArgsNonLiteral` (Error). |
| G | Low | Inefficiency | `prepareForJsonSafe` root fn is a bare `return ctxFnN(v)` forwarder for every mixed-optionality object (one extra hop/closure). | `json_prepare_safe.go:564` `buildSafeObjectLiteral` pre-hoists via `CreateFnInContext`. |
| H | Info | DX | TS-form `createJsonEncoder<T>({strategy:'compact'})` binds the option to the `val` slot (param 0), is **silently ignored with no diagnostic**, and falls back to `clone`. Correct form is `createJsonEncoder<T>(undefined, {strategy})`. | overload arg-slot resolution; no comptime-arg-in-value-slot warning. |

### Detail + verbatim evidence

**A — optional union → discriminated-union envelope (the seed, generalized).**
`StripUndefined` ([typeid.go:550-566](../../internal/compiled/runtype/typeid/typeid.go)):

```go
parts := tsType.Distributed()          // boolean|undefined → {false, true, undefined}
kept := …filter(undefined)…            // → {false, true}, len 2
if len(kept) == 1 { return kept[0] }   // only the single-member case is handled
return tsType                          // ← returns the ORIGINAL union, undefined included
```

`appendProperty` ([serialize.go:1213](../../internal/compiled/runtype/serialize.go)) then serializes that 3-member union as the property's child. Proof by contrast (all from `bin/ts-runtypes`):

- `active: boolean` (required): `val` = `typeof v.active === 'boolean'`, 1 `val` entry, **no** `pj`/`rj`, `tb` writes 1 byte (`setUint8(!!v.active)`).
- `x?: string` (single-member optional): `val` = `v.x === undefined || typeof v.x === 'string'`, **no** envelope, **no** `pj`/`rj`.
- `active?: boolean` (`probe-opt-bool/fns__pjs.js`): 5 `val` entries and the envelope —
  ```js
  const ctxFn0 = function(v){
    if ((CiE_zxt3nZt?.fn(v.active) ?? true)) return [0,v.active]; // arm 0 = undefined — DEAD (guarded by !== undefined)
    if ((CiE_O6gS6gC?.fn(v.active) ?? true)) return [1,v.active]; // false
    if ((CiE_jf9vtBd?.fn(v.active) ?? true)) return [2,v.active]; // true
    throw new Error(fuEncErr)};
  // ctxFn1: if (v.active !== undefined) _r['active']=ctxFn0(v)
  ```
  The matching `rj`/`cjr`/`fb` all carry the dead `if (dec0 === 0) { …=undefined }` unwrap. **External-JSON impact** (`probe-opt-bool/fns__sj.js`, the `direct` strategy meant for clean output): `{active:false}` serializes to `{"active":[1,false]}`.

**B — required identity-unions not collapsed on encode** (`order-ts/fns__pjs.js`, `order-ts/fns__sj.js`): `status` (5 string literals) →
```js
const ctxFn0 = function(v){ if ((CiE_ea8S0s6?.fn(v.status) ?? true)) return v.status; …(×5)… throw new Error(fuEncErr)};
```
Every arm returns `v.status`. `order-ts` emits **no** `rj` module (decode already collapses to identity) — the asymmetry. Same for `product.currency`, `user.roles`.

**C — boolean pair uncollapsed in a union** (`probe-bool-union-explicit/fns__val.js`, a REQUIRED `x: boolean | undefined`): `(typeof v.x === 'undefined' || v.x === false || v.x === true)` — no `typeof === 'boolean'`, and two separate `literal` `val` entries.

**E — binary throws the JSON message** (`probe-req-litunion/fns__tb.js`): `const fuEncErr = 'Can not json encode union: item does not belong to the union'; … else { throw new Error(fuEncErr) }`.

**F — spurious CTA001** (`tree-schema/_meta.json`): `{"code":"CTA001","severity":1,"site":{startLine:9,startCol:24}}` points at `self` in `children: RT.array(self)`; `tree-ts` has `diagnostics: []`.

### Verified NON-issues (checked, correct by design)

- **Int binary packing**: `PositiveInt`/`Integer`/`Positive` serialize as `float64` — correct, because they are UNBOUNDED (`{integer:true}` / `{min:0}`), so their range exceeds int32; the emitter DOES pack when an explicit `max` fits int8/16/32 (`numberformat.go:128-215`).
- **Recursion + circular guard** (`tree-ts`): clean named self-recursion, runtime circular-ref guard wired only where needed (`val`/`verr`/`tb`), no inline `WeakSet` bloat.
- **Nested all-primitive clone**: `prepareForJsonSafe` uses a `Object.keys(x).length === N` fast-path that returns the original reference when there are no extra keys to strip, and skips the `.map` for JSON-identity arrays. No needless deep clone.
- **TS-form vs schema-form**: otherwise structurally equivalent (0 divergences) apart from finding F and the type-name label.

### Recommended fix order

1. **Fix A (highest impact) — `StripUndefined` (`typeid.go:562`).** When `≥1` member
   survives after removing `undefined`, return a type built from `kept` rather than
   the original union (the optional's presence flag already carries "absent"). This
   alone removes A/A2/A3/A4 across all 10 families. Note the shim exposes
   `Checker_booleanType` (so `{true,false}` → atomic `boolean` is easy) but **no
   `getUnionType`**, so the general `'a'|'b'` rebuild needs either a serializer-side
   filter on the serialized child node (with a DISTINCT structural id so it is not
   shared with a genuine `…|undefined` node) or a `third_party` shim addition (which
   must be surfaced per `CLAUDE.md`, not improvised). `exactOptionalPropertyTypes` is
   OFF in the inferred program (`program.go:107`) — enabling it is not a fix.
2. **Fix C — collapse `{true,false}` → `boolean` in `finalizeUnion`** (removes the
   residual boolean split for genuine `boolean|null`).
3. **Fix B/D — add the all-identity/JSON-compatible early-out to the JSON encode
   emitters** (`union_flat.go:123`, `json_prepare_safe.go:796`) mirroring the decode
   short-circuit at `union_flat.go:294`.
4. **Fix E — binary-specific union error string** (`union_flat_binary.go:187`).
5. **Fix F — allow the `RT.circular` callback param as a `CompTimeArgs` leaf** (`scan.go`).
6. **Regression tests**: assert the generated `pjs`/`sj`/`tb` for `active?: boolean`
   contains no `[…]` envelope / discriminant / `fuEncErr`; that `x?: 'a'|'b'` and
   `x?: string|number` round-trip without a `rj` module; and add the all-strategy
   round-trip fuzzer coverage for optional unions.

---

## Fix plan

Fixes are ordered so each step is **independently shippable and testable**.
Step 1 (A) is the keystone and has been **empirically validated by a throwaway
spike** (changed `StripUndefined`, rebuilt `bin/ts-runtypes`, regenerated, reverted).
Each step lists the change, the spike-verified or expected effect, edge cases, and
risks.

### Step 1 — Fix A (keystone): strip `undefined` from multi-member optional unions ✅ spike-validated

**Change** `StripUndefined` ([typeid.go:550](../../internal/compiled/runtype/typeid/typeid.go)) to take the checker and finish the job:

```go
func StripUndefined(typeChecker *checker.Checker, tsType *checker.Type) *checker.Type {
    // …collect `kept` (non-undefined members); track hasUndefined, hasNull…
    if !hasUndefined            { return tsType }
    if len(kept) == 1           { return kept[0] }                              // existing behaviour
    if len(kept) >= 2 && !hasNull {
        return checker.Checker_GetNonNullableType(typeChecker, tsType)          // strips undefined AND re-normalises true|false → boolean
    }
    return tsType                                                              // has null: fall through (see Step 1b)
}
```

Thread the checker at all **4 call sites** (both already hold one):
`appendProperty` ([serialize.go:1215](../../internal/compiled/runtype/serialize.go), `cache.typeChecker`), `projectSignature` (:1252),
`projectTuple` (:869), and the id computer ([typeid.go:428](../../internal/compiled/runtype/typeid/typeid.go), `computer.typeChecker`).
Both the serializer AND the id computer must change together (the structural id must
match the projected node — see the recursion comment at typeid.go:417) — the shared
signature change covers both.

**Spike-verified effect** (rebuilt binary, regenerated):
- `active?: boolean` → validator collapses to `v.active === undefined || typeof v.active === 'boolean'`; binary becomes `if (v.active !== undefined) { setUint8(!!v.active); setBitMask }` (1 byte, no discriminant, no validator walk, no `fuEncErr`); the `pj` and `rj` modules **disappear** entirely (19→17 modules).
- `x?: 'a' | 'b'` → validator `v.x === undefined || (v.x === 'a' || v.x === 'b')` (the redundant `typeof === 'undefined'` arm is gone) and the `[armIndex,value]` envelope is gone. A residual empty-arm dispatch remains → handled by **Step 2**.
- `simple` preset (`active?: boolean` among primitives) → `pj`/`rj` gone.

**Edge cases to test**: `x?: string` (unchanged, still clean), `x?: boolean`,
`x?: 'a'|'b'`, `x?: string|number`, optional tuple slot `[T, U?]`, optional param
`f(x?: T)`, and a **recursive optional** (`next?: Node`) — verify the structural id
stays consistent between the TS-form and value-first schema-form (the original reason
`StripUndefined` exists).

> **No `third_party` change is needed for this step.** `Checker_GetNonNullableType`
> is ALREADY exposed by the shim (used by the validated spike). Step 1 is entirely
> in our repo.

**Step 1b — residual `x?: T | null`** (`boolean | null`, `string | null`): the type is
`T | null | undefined`, and `GetNonNullableType` drops BOTH `null` and `undefined`, so
it would lose the legitimate `null`. This is the ONLY case Step 1 doesn't clean up.
Options, **all in-repo (none touches `third_party`)**:

- **Alt A (recommended first pass): accept the residual.** `x?: T | null` keeps today's
  minor artifact (a redundant `undefined` arm). Rare shape, zero risk.
- **Alt B (general, in-repo): strip at the serialized-node level instead of the
  checker-type level.** Serialize the optional child normally, then post-process the
  resulting union node: drop the `KindUndefined` child, collapse a `{true,false}` pair
  to `KindBoolean`, and unwrap to the lone child if only one remains — and compute the
  structural id from that filtered member set (mirror in `serialize.go` + the `typeid`
  computer, which already run in lockstep). Because the id is derived from the filtered
  set, the optional-child union interns to a DISTINCT entry from a genuine required
  `T | null | undefined`, so there's no cache collision. This needs no checker union
  constructor and handles every case (boolean, `'a'|'b'`, `string|number`, `T|null`)
  uniformly — it could even REPLACE the `GetNonNullableType` call in Step 1, at the
  cost of a bit more code + keeping the two walkers mirrored.
- **Alt C (last resort, only if a checker-level filter is ever wanted): expose
  `getTypeWithFacts(t, TypeFactsNEUndefined)`** via a tsgolint shim patch (the
  `TypeFacts` constants are already exposed; the function is not). This is a
  `third_party` change and must be surfaced per `CLAUDE.md` — **not recommended**, since
  Alt A/B avoid it entirely.

Recommendation: ship Step 1 with **Alt A**; upgrade to **Alt B** if `T | null` optionals
prove common. `third_party` (Alt C) is never required.

### Step 2 — Fix B: collapse all-identity atomic unions on the ENCODE side ✅ spike-confirmed residual

The decode emitters already early-out to identity (`union_flat.go:294`); the encode
side does not. Add the symmetric guard to `emitUnionPrepareForJsonFlat`
([union_flat.go:123](../../internal/compiled/typefns/union_flat.go)),
`emitUnionPrepareForJsonSafe` ([json_prepare_safe.go:796](../../internal/compiled/typefns/json_prepare_safe.go)),
and the compact `cj` encoder: when `len(layout.ObjectMembers) == 0 && !layout.AtomicNeedsTuple`
(⇒ every member is JSON-identity), return identity (`Code: ""`). Removes the empty-arm
dispatch for `x?: 'a'|'b'` AND the required `status`/`currency`/`roles` cases (finding B).
**Risk**: confirm `isJsonCompatible` ⇒ noop and that dropping the per-member `throw` is
acceptable (the decode side already omits it; encoders assume validated input — consistent).

### Step 3 — Fix C: collapse `{true,false}` → `boolean` in genuine unions

In `finalizeUnion` ([union_safeorder.go:23](../../internal/compiled/runtype/union_safeorder.go)) or the serialize union
case (serialize.go:660): when the members include BOTH boolean literals, replace the
two `KindLiteral` children with one interned `KindBoolean`. After Step 1 the optional
case is already handled, so this only affects genuine **required** unions
(`x: boolean | null`, `x: boolean | 'other'`). Lower priority.

### Step 4 — Fix D (optional): JSON families shouldn't tuple-wrap identity members

Largely subsumed by Step 1 for optionals. Residual only for genuine required
`x: T | undefined`. If pursued: for the JSON families only, collapse all
`isJsonCompatible` members into a single "raw" arm and reserve explicit tuple indices
for the non-JSON members (`union_flat_layout.go:188`). Binary is unaffected (it needs the
discriminant). Higher complexity / lower value — **defer** unless required `T | undefined`
unions prove common.

### Step 5 — Fix E: binary-specific union error string (trivial)

Add `flatUnionEncodeBinaryErrorVar` (message `'Can not binary encode union: …'`) and
use it at [union_flat_binary.go:187](../../internal/compiled/typefns/union_flat_binary.go) instead of the JSON `flatUnionEncodeErrorVar`.

### Step 6 — Fix F: the schema-form `RT.circular(self)` spurious CTA001 — ✅ DONE

**Moved to its own spec: [circular-self-marker-no-callback.md](circular-self-marker-no-callback.md).**
Root: `array(item: CompTimeArgs<RunType<T>>)` makes `checkCompTimeArgs` validate the
callback parameter `self` (an identifier) → **CTA001 Error** (though codegen succeeds).
The better fix is the API simplification in that spec — a function-free
`circular(object({… self() …}))` form using the existing `self()` marker (a builder
*call*, which passes the literal check), which removes the `self` identifier entirely
and fixes F at the root. Empirically confirmed: the marker form emits zero diagnostics.

### Step 7 — Fix G (polish): drop the `prepareForJsonSafe` root forwarder

`buildSafeObjectLiteral` ([json_prepare_safe.go:564](../../internal/compiled/typefns/json_prepare_safe.go)) pre-hoists via `CreateFnInContext`,
producing `return ctxFn0(v)`. Return the accumulator as a raw `CodeRB` block and let the
existing hoist path wrap only when the parent slot needs it. Batch with Step 2.

### Step 8 — Fix H (DX): warn on a comptime option passed in the value slot

TS-form `createJsonEncoder<T>({strategy})` silently binds the option to the `val` slot
and falls back to `clone`. Emit a build-time **Warning** when a `createX` value-slot
argument is an object literal matching the options shape while `T` came from a type
argument. Low priority; a docs note is an acceptable alternative.

### Test strategy

- **Go unit** (`internal/compiled/typefns/{union_flat_test.go, noop_types_test.go, union_flat_layout_test.go}`, plus a `StripUndefined` test): assert the collapsed child kind + the absence of envelope/dispatch. Reuse the paired-form-equivalence pattern (`TestAtomic_FormEquivalence`) so TS-form and schema-form agree for optional unions.
- **JS plugin regression** (`packages/runtypes-devtools/test/`): assert the generated `pjs`/`sj`/`tb` for `active?: boolean` contain no `[` envelope / `fuEncErr` / discriminant; that `{active?: boolean}` emits no `pj`/`rj` module; and that the binary is 1 byte. Rebuild `bin/ts-runtypes` before `pnpm test`.
- **Fuzz**: extend the all-strategy round-trip fuzzer (`docs/todos/all-strategy-roundtrip-fuzzer.md`, `packages/ts-runtypes/test/fuzz/`) with optional-union shapes across every strategy.

### Recommended shipping order

**A → E → B → C → F**, then optional **D / G / H**. A + B + E clear the reported issue
and the bulk of the waste; C and F are independent smaller bugs; D/G/H are polish. When
a step ships, `git mv` this todo to `docs/done/` (or `docs/partially/`) and update
`README.md` / `docs/ARCHITECTURE.md` / the website docs if the optional wire format is
described there.
