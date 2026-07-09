# `rt$` — one explicit, reserved prefix for every enrichment meta key

> **Status: SHIPPED — implemented as specced on the
> `claude/friendlytypes-i18n-l8e2y3` branch (PR #166).** One implementation
> note: the reservation walkers deref property-child ref sentinels explicitly
> (`derefPropertyChildren` in validate.go) so the same check serves both the
> raw `ResolveTypeRaw` closure shape (the gen pre-flight) and the inlined
> checker shape (FT011/MD011).

## Motivation (decided in design dialogue, 2026-07-03)

The `$` prefix exists to tell compiler-owned meta keys apart from the names of
the namespace they sit in — the type's property names at node level, the
constraint vocabulary inside the error record. But bare `$` is a weak
discriminator: `$`-prefixed property names are legal TypeScript, and today a
type with a property literally named `$label` produces a silently broken
scaffold — `gen` exits 0 and emits an object literal with DUPLICATE `$label`
keys (meta + child), which TS rejects and plain JS resolves last-wins,
swallowing the meta. The reconcile compounds it: `merge.go` treats ANY
`$`-prefixed key as meta (`strings.HasPrefix(key, "$")`), so such a property
can never round-trip.

## Decisions (all DECIDED)

1. **Every enrichment meta key is renamed `$X` → `rt$X`**, across BOTH families
   and the error record:
   - FriendlyType node meta: `rt$label`, `rt$errors`; container meta
     `rt$items`, `rt$slots`, `rt$keys`, `rt$values`.
   - Error-record mode key: `rt$default` (its `$` disambiguated it from the
     constraint vocabulary; same rule, same prefix now).
   - MockData meta: `rt$items`, `rt$slots`, `rt$length`, `rt$size`, `rt$optional`.
   - `__rt_typeName` → **`rt$typeName`** — that spelling existed only to dodge
     the child-map collision this reservation now rules out; the odd one out
     dies.
2. **`rt$` is chosen over `ft$`** because the prefix must cover `MockData<T>`
   too (`ft` = friendly-type would not), and it matches the existing `rt`
   branding (`@rtType`, `RT_*` env vars).
3. **The `rt$` prefix is RESERVED in enriched types** (the GraphQL `__` move):
   a type declaring an `rt$`-prefixed property cannot be enriched.
   - `gen` refuses to scaffold the const, with an Error naming the property.
   - `check` reports it as **FT011** / **MD011** (Error): "property 'rt$…'
     collides with the reserved enrichment meta prefix; rename it or exclude
     the type from enrichment".
   - No TS-level guard: real-world `rt$…` property names are essentially
     nonexistent, the Go checker is the belt-and-braces, and a type-level walk
     would tax every `FriendlyType<T>` instantiation for a never-case. (TS
     still errors naturally on a collision — an unsatisfiable intersection —
     it is just not prettified.)
4. **Plain `$`-prefixed properties become ORDINARY child fields** — fixed by
   construction: after the rename, `$label: string` in a user type is just a
   field (scaffolded, reconciled, rendered like any other). A regression test
   pins the round-trip.
5. **Unprefixed vocabulary stays unprefixed.** Constraint keys (`type`,
   `minLength`, …) mirror the validator's wire names 1:1; plural arms are the
   closed CLDR set; mock leaf knobs (`pool`, `min`, `max`) are the mock DSL's
   own leaf vocabulary. None of these namespaces mixes with user property
   names the way node meta does.
6. Future meta keys (`rt$members` for union per-member addressing is the
   parked candidate) ride the same reservation — no new breaking change when
   they land.
7. Out of scope, noted: mock's leaf knobs (`pool`/`min`/`max`) are matched by
   NAME in the mock walkers, so an OBJECT field named `pool` is a latent
   confusion of the same class — much lower risk (leaf-only semantics), left
   for a follow-up if it ever bites.

## Implementation plan

- **A. Mechanical rename** across Go (emit, validate, mirror merge/reconcile,
  closure, config comments, all tests), TS (`friendlyType.ts`,
  `createFriendlyText.ts`, `mockData.ts`, mock runtime, all tests + fuzz models),
  and docs (website friendly/mock/i18n/configuration pages, AI_ENRICHMENT,
  skills ×3 both copies, todo specs). Ordered replacements per key: Go-regexp
  replacement literals (`$$X`), regex escapes (`\$X`), then plain (`$X`).
  EXCLUDED: `docs/done/` (historical — deviation ledger instead),
  `container/website/content/index.md` (home page is off-limits — flagged to
  the user), `TypedTitle.vue` (Vue's own `$slots`), `third_party/`.
- **B. The prefix gate** — `merge.go`'s any-`$`-is-meta check narrows to
  `rt$`; `validate.go`'s meta-key sets rename.
- **C. Reservation diagnostics** — shared `reservedPropertyName` helper; FT011
  + MD011 Errors in the checker walk (over the RUNTYPE's property names), a
  hard error in the `gen` emit walk.
- **D. Tests** — rename fallout across every suite; new: FT011/MD011 cases,
  gen-refusal case, and the `$label`-property round-trip regression (gen →
  update idempotent, renderer addresses the field).
- **E. Docs** — pages + skills renamed in A; deviation addendum in the two
  done specs; PR #166 body; move THIS file to `docs/done/`.

## Acceptance

- No bare-`$` meta key remains anywhere outside `docs/done/` and the excluded
  files; `pnpm test`, `go test ./internal/... ./cmd/...`, fuzzers, lint,
  format all green.
- A type with a `$label` property enriches normally; a type with an
  `rt$label` property fails `gen` and `check` with FT011/MD011.
