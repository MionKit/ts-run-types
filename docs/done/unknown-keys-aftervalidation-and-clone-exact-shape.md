# TODO — unknown-keys overhaul: `runsAfterValidation` fast path + `cloneExactShape` family

Status: **IMPLEMENTED** (single PR, all phases). The spec below is the design
document; the deltas the implementation settled differently are listed here:

- **Call shape**: options ride slot 1 per house convention —
  `createHasUnknownKeysFn<T>(undefined, {runsAfterValidation: true})` (or
  schema-form `createHasUnknownKeysFn(rt, {runsAfterValidation: true})`), like
  `createValidateFn`'s options. The bare-options examples below are shorthand.
- **huk fnHash changed**: moving `hasUnknownKeys` onto its options axis makes
  its canonical key `hasUnknownKeys|<suffix>` (consistent with `validate|`),
  so the PLAIN huk fnHash moved `trR` → `lRN` (variant `OV` = `Omg`). A
  consumer pinning fn-hash prefixes must re-pin huk once.
- **cloneExactShape contract — ISOLATION guarantee** (upgraded from the
  strip-guarantee draft after review; all pinned by tests, full suite at
  packages/ts-runtypes/test/suites/cloning/): `clone(x) !== x` for every
  object-typed position. Only primitives (compare by value — freshness is
  meaningless) and opaque values (`any`/`unknown`/bare `object`, functions,
  symbols, promises, non-serializable handles — copying a resource is wrong,
  `overrideCloneExactShape` is the escape hatch) pass through. Temporal
  instances, though immutable, re-materialize via their static `from()` so
  identity-based test assertions hold. DECLARED members are NEVER dropped
  (no DataOnly projection here — that is a wire concern): a declared member
  holding an unrebuildable value is kept, shared by reference, with a build
  advisory (CES010 functions / CES015 symbol-Promise-native; CES011 class
  methods ride the prototype). Only UNDECLARED keys drop — the strip
  guarantee.
  - Objects always rebuild; plain class instances rebuild prototype-
    preservingly (`Object.create(Object.getPrototypeOf(v))` + declared-prop
    assigns) so `instanceof` survives — better than both the "diagnostic"
    and "plain-object rebuild" options considered below.
  - Arrays/tuples are always fresh: `.slice()` when the element type is
    immutable/opaque (a slice IS a deep clone then), `.map(clone)` otherwise.
  - Map/Set are always fresh: `new Map(v)` / `new Set(v)` when entries are
    immutable/opaque, per-entry rebuild otherwise.
  - Date re-wraps (`new Date(v.getTime())`); RegExp re-compiles keeping
    flags + lastIndex; Temporal re-materializes via `Temporal.<T>.from(v)`.
  - Index signatures do the fresh copy walk — including alongside named
    props (sig-matched keys are DECLARED and are copied, never dropped).
  - Object-bearing unions: the FACTORY throws at creation (house alwaysThrow
    convention, message carries CES001) and the build surfaces the CES001
    error diagnostic. Atomic unions with mutable members (`Date | null`)
    emit per-member dispatch arms; fully-immutable unions pass through.
  - The family has its own noop predicate (isNoopForCloneExactShape):
    identity only for fully immutable/opaque subtrees.
- **Emitter internals**: the count helper is the pure fn `rt::countEnumKeys`
  (alias `cntEK`), registered in pure-fns-utils.ts beside hUKFA; the walker's
  existing VariantOptions plumbing carries `runsAfterValidation` (axis
  `AxisHasUnknownKeysOptions`, variant suffix `OV`).
- **HMR flags**: `addedStripUnknownKeys` / `addedUnknownKeysToUndefined` were
  replaced by `addedCloneExactShape` on the wire (protocol.Response +
  devtools resolver-client).

Original spec follows.
Benchmarks that drove every decision here were run with process-isolated
micro-benchmark scripts (bench.mjs / wide.mjs / mem.mjs, Node 24.18,
2026-07-16); the scripts were exploration tooling and were removed after the
implementation landed — every result table they produced is inlined below,
and the cloning fuzz + suite are the living verification now.

---

## 1. Motivation (measured)

Perf, moltar shape (`clean` = no extras, the common hot path; `dirty1` = 1 root + 1 nested extra):

| what | today | after this TODO | factor |
|---|---|---|---|
| `hasUnknownKeys` (clean) | 24.8 M ops/s | 75.4 M (count fast path) | **3.0×** |
| `validate + !hasUnknownKeys` flow (clean) | 24.6 M | 47.4 M | **1.9×** |
| `hasUnknownKeys`, 30 flat props | 0.7 M | 30.9 M | **~44×** |
| strip (clean) | 20.0 M (`suk`) | 59.1 M (clone) | **3.0×** |
| strip (dirty1 / dirty5) | 2.7 M / 2.0 M (`suk`) | 49.5 M / 46.3 M (clone) | **18× / 23×** |
| strip, 30 props | 0.4–0.7 M (`suk`/`uku`) | 42.5 M (clone) | **60–100×** |

Memory (200k retained stripped objects, settled heap; `mem-results.md`):

| variant | clean | dirty1 | dirty5 |
|---|---|---|---|
| input as parsed | 144 B | 160 B | 200 B |
| `stripUnknownKeys` (delete) | 144 B | **960 B** | **1344 B** |
| `unknownKeysToUndefined` | 144 B | 160 B | 200 B |
| clone | 144 B | **144 B** | **144 B** |

`delete` flips both root and nested objects into dictionary mode: **6.7–9.3× more retained
memory** than the clone, and downstream property reads run ~10× slower per read. GC churn:
the clone adds only ~3.5 ms GC per 1M ops on clean data (scavenges of short-lived garbage),
while delete-strip on dirty data causes the *most* GC of all variants (22.3 ms/Mops).
There is no measured dimension — time, retained memory, or GC — in which the mutating
strips beat the clone once extras exist.

Negative results that shape the design (do NOT re-introduce these):

- `runsAfterValidation` guard-removal alone is noise (1.02–1.05×). The count check is the win.
- `Object.keys(v).length === N` **gating/reuse shortcuts lose below ~30 props** — the check
  costs more than rebuilding a small object. The nested-reuse shortcut in today's `pjs`
  `ctxFn0` makes the emitted clone **1.6× slower** for the moltar shape.
- `Set.has` membership loses to the linear key-array scan at these sizes (0.65–0.70×).
- Single-pass in-place strip (for-in + membership + delete) is *slower* than the current
  two-pass array version. Delete-based strip is unsalvageable on V8.
- for-in counting beats `Object.keys().length` ~1.4× (no array allocation), and a hoisted
  count helper called as an expression measures the same as inlined loops (V8 inlines it).

## 2. Decisions

- **D1** — `createHasUnknownKeysFn<T>(options?)` gains a comptime option
  `{runsAfterValidation?: boolean}`. Eligible object nodes emit a key-count check via a new
  pure fn `rt::countEnumKeys`; ineligible nodes fall back to `hUKFA` *without* the object
  guard. Contract: calling the runsAfterValidation variant on non-validated input is undefined
  behavior.
- **D2** — new public family **`cloneExactShape`** (factory `createCloneExactShapeFn<T>()`,
  fn type `CloneExactShapeFn`, wire key `'ces'`): non-mutating deep clone of the *declared*
  shape — unknown keys dropped by construction, runtime types preserved (`Date` stays a
  `Date`, `Map`/`Set` stay `Map`/`Set`). **No reuse shortcuts, no count gates** — always
  rebuild (see negative results).
- **D3** — **remove** the public `createStripUnknownKeys` (delete-based) and
  `createUnknownKeysToUndefined` factories and their public cache families. The internal
  wire variant `unknownKeysToUndefinedWire` (`ukuw`) is untouched — the JSON decoder's
  `'strip'` strategy keeps using it (mutation of a freshly-parsed, exclusively-owned value
  is the one place in-place is structurally right). Breaking change, acceptable pre-1.0.
- **D4** — `createUnknownKeyErrorsFn` (`uke`) **stays**: it is error reporting, not a strip;
  `rt::getUnknownKeysFromArray` stays for it.
- **D5** — out of scope for this PR (future candidates): folding a strict count check into
  `createValidateFn` (single-pass isStrict), re-evaluating the `pjs` Approach-3 fastpath with
  a size threshold, decoder clone-vs-`ukuw` experiment.

### Why removing the mutating strips is safe (niche-scenario audit)

Scenarios where in-place strip is genuinely wanted, and their answers:

1. *Alias-visible mutation* (several references must observe the strip): rare; recipe is
   reassignment (`req.body = clone(req.body)`), the standard pattern anyway.
2. *Peak-memory-bound giant payloads* (can't afford transient input+clone): the parse path
   is the decoder's job and stays mutating internally via `ukuw`. Manual flows this large
   should use `createJsonDecoderFn` rather than parse-then-strip.
3. *Reactive/proxied objects* (Vue/MobX — mutation must go through the proxy): clone +
   assign into the reactive root is the framework-recommended pattern.
4. *"I own it, avoid the alloc"*: measured — the alloc is cheaper than the scan
   (clone 59 M vs `uku` 20 M ops/s on clean), and `uku`'s output leaks unknown keys through
   spread/`in`/`Object.keys` (`{...stripped}` copies `extra: undefined`!), which defeats
   the security purpose of stripping.

None survive the numbers. The emitter machinery for to-undefined stays in-tree (ukuw
delegates to it), so re-introducing a public factory later is one registry row + one
wrapper if a real user need appears.

---

## 3. Phase A — `runsAfterValidation` on `createHasUnknownKeysFn`

### Emitted code, old vs new (moltar `ToBeChecked`, all props required)

Today (`huk`, verbatim from the generated case module):

```js
const k_h3F1tjf = ['bool','foo','num'];
const hUKFA = utl.getPureFn('rt::hasUnknownKeysFromArray');
const k_d1lDhHV = ['boolean','deeplyNested','longString','maxNumber','negNumber','number','string'];
function IOY_d1lDhHV(v, opts = {}) {
  return ((typeof v === 'object' && v !== null && hUKFA(v, k_d1lDhHV)) ||
          (typeof v.deeplyNested === 'object' && v.deeplyNested !== null && hUKFA(v.deeplyNested, k_h3F1tjf)));
}
```

New, `createHasUnknownKeysFn<ToBeChecked>({runsAfterValidation: true})` — fully count-eligible
shape (7 and 3 are the declared prop counts; the key arrays disappear entirely):

```js
const cnt = utl.getPureFn('rt::countEnumKeys');
function IOY_av(v, opts = {}) {
  return (cnt(v) !== 7 || cnt(v.deeplyNested) !== 3);
}
```

Mixed shape example — optional props make a node count-ineligible; it falls back to
`hUKFA` *minus the object guard*, and eligible sub-objects still count:

```ts
interface Order { id: number; items: {sku: string; qty: number}[]; meta?: {tag: string} }
```

```js
const k_order = ['id','items','meta'];        // root ineligible: `meta` is optional
const hUKFA = utl.getPureFn('rt::hasUnknownKeysFromArray');
const cnt = utl.getPureFn('rt::countEnumKeys');
function HUK_av(v, opts = {}) {
  return (hUKFA(v, k_order)
    || hukItems(v.items)                       // array walk; element objects emit cnt(e) !== 2
    || (v.meta !== undefined && cnt(v.meta) !== 1));
}
```

### Fast-path eligibility (per object node)

Count check `cnt(x) !== N` is emitted iff ALL of:

- every RT child property is required (`!resolved.Optional`), and
- no index-signature child, and
- `rtChildrenNames == allChildrenNames` (no static/function-typed props the RT skipped —
  those aren't validated, so their presence is unpredictable), and
- the node is not inside the union merged-allowlist walker (`emitUnionUnknownKeysMerged`
  stays as-is — validate doesn't tell us which arm matched).

Otherwise: `hUKFA(x, keys)` fallback with `keepObjectCheck=false`. Optional descent keeps
its existing property-level `!== undefined` guard.

### Why a compile flag — the count check cannot be unconditional

The soundness of `cnt(v) !== N` does NOT come from the object guards; it comes from
validation having proven that all N required props are PRESENT. Standalone (no prior
validation) the count check is wrong in both directions against declared `{a, b, c}`:

| input | `hUKFA` (correct) | `cnt(v) !== 3` |
|---|---|---|
| `{a, b, x}` — swap: missing prop + extra key | `true` | `false` — **false negative** |
| `{a, b}` — missing prop, no extras | `false` | `true` — **false positive** |

After validation both rows are impossible (every required prop is present), so key-count
exactly separates clean from dirty. Considered and rejected: the standalone-sound partial
shortcut `cnt(v) > N ⟹ true` — when `cnt(v) === N` a full scan is still required to catch
the swap case, and `=== N` is exactly the clean hot path, so it accelerates nothing that
matters. The no-flag end state is folding the count into the validator itself
(`createValidateFn({strict: true})`) — future work, §7.

### Semantics notes (document in JSDoc)

- runsAfterValidation output on **non-validated input is undefined behavior** (may throw on
  `null`, may mis-answer). That is the flag's meaning.
- Count checks assume JSON-like own-enumerable data. An object carrying a *validated* prop
  on its prototype plus an own unknown key can fool the count. The current for-in scan has
  its own inherited-enumerable quirks, so this is a lateral move, not a regression — but
  state it.
- `checkNonRTProps` runtime option: moot on count-eligible nodes (they have no non-RT
  props by rule); still honored on fallback nodes. Keep the `(v, opts)` signature.

### Implementation checklist — Phase A

TS side (`packages/ts-runtypes/src/`):
- [ ] `pure-fns-utils.ts`: add `pf_countEnumKeys = registerPureFnFactory('rt::countEnumKeys', ...)`
      returning `(o) => { let n = 0; for (const k in o) n++; return n; }`.
- [ ] `createRTFunctions.ts`: new `HasUnknownKeysCompileOptions {runsAfterValidation?: boolean}`;
      switch `createHasUnknownKeysFn` from the 2-slot `createRTFunction` wiring to the 3-slot
      options-carrying wiring (same shape as `createValidateFn`: schema-form + value-form
      overloads, options at slot 1 validated by comptimeargs, injected tuple at slot 2).
- [ ] `index.ts`: export the options type.
- [ ] Regenerate `fnHashes.generated.ts` (options fork the entry fnHash variant — the
      pre-baked-variant mechanism `resolveEntryTupleFn` already supports).

Go side (`ts-go-runtypes/internal/`):
- [ ] `compiler/marker/marker.go` (+ scanner): `createHasUnknownKeysFn` now has an options
      slot — slot index of the injected tuple moves from 1 to 2; options literal read via
      `comptimeargs` (no new machinery).
- [ ] `cachegen/typefunctions/unknownkeys_shared.go`:
      `callCheckUnknownPropertiesForHas` gains `keepObjectCheck bool` (the lever its
      comment already anticipates); add `countFastPathEligible(rt, ctx) (n int, ok bool)`
      implementing the rules above (reuse `addObjectPropsToContext` internals).
- [ ] `cachegen/typefunctions/unknownkeys_has.go`: thread the runsAfterValidation mode
      (RenderOpts/variant); eligible object nodes emit `cnt(v) !== N` (+ hoist
      `const cnt = utl.getPureFn('rt::countEnumKeys')` context item + AddPureFnDependency);
      ineligible nodes emit guardless `hUKFA`.
- [ ] `purefn_aliases.go`: alias for `countEnumKeys`.
- [ ] Whole-program pure-fn registration check (PFE9012) knows the new key.

Tests:
- [ ] Go golden emits: fully-eligible, optional-prop fallback, index-sig, non-RT-children,
      nested-only-eligible, union fallback. Assert **no `typeof x === 'object'` guards**
      in runsAfterValidation-mode output.
- [ ] Runtime parity: runsAfterValidation variant agrees with standalone variant on validated inputs
      (clean / root-extra / nested-extra / many-extras); optional-prop shapes; frozen input.
- [ ] Both variants of the same type coexist in one build (cache-key fork works).

---

## 4. Phase B — `cloneExactShape` family

### Emitted code, old vs new

Today's delete-strip (`suk`, reconstructed from `unknownkeys_strip.go` — this is what gets
**removed**):

```js
const gUKFA = utl.getPureFn('rt::getUnknownKeysFromArray');
const k_d1lDhHV = ['boolean','deeplyNested','longString','maxNumber','negNumber','number','string'];
const k_h3F1tjf = ['bool','foo','num'];
function SUK_d1lDhHV(v) {
  const unk0 = gUKFA(v, k_d1lDhHV);
  if (unk0) { for (const ky0 of unk0) { delete v[ky0] } }
  const unk1 = gUKFA(v.deeplyNested, k_h3F1tjf);
  if (unk1) { for (const ky1 of unk1) { delete v.deeplyNested[ky1] } }
  return v;
}
```

New `cloneExactShape` for the same type — declared-shape rebuild, **no key arrays, no
scans, no `Object.keys` gates**:

```js
const ctxFn0 = function (v) {
  return {foo: v.deeplyNested.foo, num: v.deeplyNested.num, bool: v.deeplyNested.bool};
};
function CES_d1lDhHV(v) {
  return {number: v.number, negNumber: v.negNumber, maxNumber: v.maxNumber,
          string: v.string, longString: v.longString, boolean: v.boolean,
          deeplyNested: ctxFn0(v)};
}
```

Note the deliberate difference from today's `pjs` emit: **no**
`if (Object.keys(v.deeplyNested).length === 3) return v.deeplyNested;` reuse line — that
check measured 1.6× slower than unconditional rebuild (see §1).

Type preservation — where `cloneExactShape` differs from `pjs` (which is a JSON-safe
projection, not a clone):

```ts
interface Event { at: Date; tags: Set<string>; meta: Map<string, {n: number}> }
```

```js
// pjs today:            {at: v.at.toISOString(), tags: [...], meta: [[k, {…}], …]}
// cloneExactShape:
const ctxFnM = function (v) {
  const m = new Map();
  for (const e of v.meta) m.set(e[0], {n: e[1].n});
  return m;
};
function CES_evt(v) {
  return {at: new Date(v.at.getTime()), tags: new Set(v.tags), meta: ctxFnM(v)};
}
```

Optional props use the accumulator form (mirrors `buildSafeObjectClone`'s CodeRB path),
so absent optionals stay *absent* (not `key: undefined`):

```js
function CES_user(v) {
  const r = {id: v.id, name: v.name};
  if (v.nick !== undefined) r.nick = v.nick;
  return r;
}
```

### Per-kind emit table (derive emitter from `json_prepare_safe.go`, minus JSON transforms)

| kind | emit |
|---|---|
| primitives, enum, literal, bigint | passthrough `v` |
| object / Class SubKindNone | literal rebuild of declared props; optionals via accumulator; NO reuse shortcut |
| array | `const r = new Array(v.length); for (…) r[i] = <child>; return r` (atomic element → `v.slice()`) |
| tuple | positional rebuild `[<m0>, <m1>, …]` |
| Date / Temporal | `new Date(v.getTime())` / Temporal objects are immutable → passthrough |
| Map / Set | atomic key+value → `new Map(v)` / `new Set(v)`; otherwise per-entry rebuild via ctx fn |
| index signature | for-in copy with sibling-named skip set + child recurse (reuse `buildSafeIndexSignatureObject` logic, value transform = clone) |
| function/method/symbol/Promise-valued props | dropped from the clone (DataOnly semantics, same as pjs) |
| union of atomics | passthrough |
| union containing objects | **compile diagnostic, unsupported in v1** (arm discrimination at runtime is a v2 design; do not silently not-strip) |
| class with custom serializer / non-serializable | compile diagnostic, unsupported in v1 |

Fallback story: identity fallback (`identityValueFn`) covers only the no-plugin case, same
as the old strip. Within a compiled build, unsupported kinds must **fail the build with a
diagnostic** — a strip that silently doesn't strip is a security bug, not a fallback.

### Implementation checklist — Phase B

- [ ] `internal/constants` `CacheModules`: new key `cloneExactShape` (wire key `'ces'`).
- [ ] New `cachegen/typefunctions/clone_exact_shape.go`: `CloneExactShapeEmitter` per the
      table; `Args()` = single `vλl`; `Finalize`: empty body → `return v`, noop.
- [ ] `families.go`: add `family("cloneExactShape", CloneExactShapeEmitter{})`.
- [ ] Diagnostics: new codes for the two unsupported-kind cases (follow `diag_codes.go`
      conventions); diagnostic slots for dropped members (mirror `SlotMethodDropped` use).
- [ ] TS: `CloneExactShapeFn<T> = (value: unknown) => T`… (match house style — the strip
      returned `unknown`; returning `T` is strictly better here), factory
      `createCloneExactShapeFn` via `createRTFunction` (2-slot, no options), schema-form +
      value-form overloads, marker key `'ces'`, exports, fnHashes regen.
- [ ] Tests (Go goldens + runtime):
      input never mutated (deep-freeze the input in tests — must not throw and must not
      change); unknown keys dropped at all depths incl. arrays/index-sigs/maps;
      `out !== in` at every object level; `instanceof Date/Map/Set` preserved with fresh
      identities; absent optionals stay absent; declared-key order stable
      (`JSON.stringify` parity with the old strip's output on JSON-safe types);
      golden emits contain **no `Object.keys` calls** for plain product shapes;
      diagnostics fire for object-bearing unions and custom-serializer classes.

---

## 5. Phase C — remove `stripUnknownKeys` + `unknownKeysToUndefined` (public)

Coupling facts (verified):
- `UnknownKeysToUndefinedWireEmitter` **delegates** to `UnknownKeysToUndefinedEmitter`
  (`unknownkeys_to_undefined_wire.go` calls its `Args/Emit/Finalize`), so the
  `unknownkeys_to_undefined.go` **emitter file stays**. Only the public factory and the
  `unknownKeysToUndefined` family *row* go.
- The JSON composite decoder uses `ukuw` (`json_composite.go:337`), not the public `uku`.
- `emitUnionStripUnknownKeys` lives in `unknownkeys_strip.go` and is strip-only; shared
  arms (`emitPropertyUnknownKeys`, `emitArrayUnknownKeys`, …) live in
  `unknownkeys_arms.go` and are used by uku/uke — arms file stays.

Checklist:
- [ ] Grep first: `grep -rn '"stripUnknownKeys"\|"unknownKeysToUndefined"' internal/` —
      confirm no composite/resolver demand besides the family rows before deleting rows.
- [ ] Go: delete `unknownkeys_strip.go` (+ its tests/goldens); remove both rows from
      `families.go`; keep `unknownkeys_to_undefined.go` (mark it internal-only in its
      header comment: "public factory removed; this emitter backs ukuw"); prune
      `stripUnknownKeysNoopSpec` and strip-only entries in `noop_types.go` /
      `diag_codes.go`; remove `'suk'`/`'uku'` from `CacheModules` (keep `ukuw`); update
      the five-family mirror comments ("five" → recount).
- [ ] Marker/scanner: drop `createStripUnknownKeys` / `createUnknownKeysToUndefined`
      fnName mappings and `'suk'`/`'uku'` marker keys (keep `'ukuw'` internal key).
- [ ] TS: remove both factories + `StripUnknownKeysFn`/`UnknownKeysToUndefinedFn` types +
      `index.ts` exports; fnHashes regen.
- [ ] Examples: delete `packages/examples/src/guide/unknown-keys-strip.ts` and
      `unknown-keys-to-undefined.ts`; add `clone-exact-shape.ts` guide (validated-input →
      exact clone; show frozen input working, which the delete-strip could never do).
- [ ] Docs: ARCHITECTURE.md family list; leave `docs/done/*` untouched (historical).
- [ ] CHANGELOG: breaking-change entry with migration snippet:
      `createStripUnknownKeys<T>()` → `createCloneExactShapeFn<T>()` (note: returns a NEW
      value; reassign instead of relying on in-place mutation), and the §2 niche-scenario
      recipes for anyone who needed aliasing/zero-alloc behavior.

---

## 6. Verification & acceptance

- [ ] `pnpm run check:builds && pnpm test && pnpm run lint && pnpm run typecheck` green.
- [ ] Golden emits reviewed: av-huk has no object guards and uses `cnt()`; `ces` emits
      contain no scans, no key arrays (product shapes), no keys-length gates.
- [x] Superseded: the bench scripts were removed after landing; the cloning
      suite + fuzz lane verify behavior against the REAL emitted
      functions (swap the verbatim replicas for imports from a compiled fixture):
      targets ≥2.5× runsAfterValidation-huk (clean), ≥2.5× ces vs old suk (clean), ≥15× (dirty1), memory
      table reproduces (clone retained ≤ input, no dictionary-mode blowup).
- [ ] moltar follow-up (separate repo, after release): case swaps to
      `createCloneExactShapeFn` (drops the `getRTFunction<'pjs'>` wrapper hack) and
      `createHasUnknownKeysFn<ToBeChecked>({runsAfterValidation: true})` in `isStrict`.
      Expected: assertStrict/parseStrict ≈ 1.9×, parseSafe modestly up (pjs shortcut gone).

## 7. Explicit non-goals (this PR)

- `createValidateFn({strict: true})` single-pass strict validator (future; est. > the 1.9×).
- `pjs` Approach-3 fastpath size-threshold re-evaluation (encode path only).
- Decoder `'strip'`-strategy clone-vs-`ukuw` experiment.
- Union arm-discriminated cloning (v2 of `ces`; v1 diagnoses object-bearing unions).
