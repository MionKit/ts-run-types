# FriendlyText `rt$default` mode — keep+fix, or remove? (doc-vs-code inconsistency)

**Status:** done — shipped **Option B (keep + fix)**. `rt$default` stays; the renderer now emits
ONE message per field (branch `claude/friendlytext-rtdefault-onefield`).
**Created:** 2026-07-22

## Correction up front

`rt$default` is **NOT removed** from ts-runtypes — it is a live, first-class, documented,
diagnostic-enforced feature (a mion-side assumption that it was gone is wrong). It appears in:

- **Types** — `src/enrich/friendlyText.ts`: `DefaultOnlyTemplates = {rt$default: FriendlyTemplate;
  type?: never}`, part of the `ErrorTemplates` / `BareTemplates` union.
- **Renderer** — `src/enrich/createFriendlyText.ts:334` (`resolveTemplate` falls back to
  `errorTemplates.rt$default`).
- **Diagnostic** — `FT009` enforces `rt$default` mutual-exclusivity with per-constraint keys
  (Go side + `packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts`).
- **Docs** — `docs/AI_ENRICHMENT.md` ("the exclusive catch-all mode", §rt$default, FT009).
- **Skills** — `packages/ts-runtypes/skills/{runtypes-friendly-type,rt-enrich-types}/SKILL.md`.

## The real finding — a doc inconsistency (and probable behavior bug)

The two doc statements about what `rt$default` emits **contradict each other**:

- `friendlyText.ts:80` — "rt$default mode: **ONE message for the whole field**, whatever failed."
- `AI_ENRICHMENT.md:283` — "a single template **rendered for EVERY failure** of that field."

The renderer follows the *second* reading: `renderErrors` (`createFriendlyText.ts:365`) loops
`for (const err of group.errors)` and pushes one message per error, all resolving to the same
`rt$default` template. So a field that fails **2+ constraints** (e.g. `minLength` + `pattern`) under
an `rt$default` node emits **N identical messages**, not one — contradicting `friendlyText.ts:80`
and the "one sentence per field" framing in the skills.

## Decision needed (pick one)

- **A — Remove `rt$default` entirely** (maintainer's stated leaning). FriendlyText then supports only
  per-constraint templates (a list of messages) / full objects. Scope: drop `DefaultOnlyTemplates`
  from the type union, the renderer fallback, the `FT009` diagnostic (Go + generated catalog + its
  Go check), and every doc/skill/test reference. Removes the "single message per field" capability —
  authors wanting one sentence must accept a per-constraint list (or the `other`/type template).
- **B — Keep it, fix the inconsistency**: decide the intended semantics (almost certainly "one
  message per field") and make `renderErrors` **dedupe** `rt$default`-sourced messages by path so a
  multi-constraint field yields exactly one; then align `AI_ENRICHMENT.md:283` with
  `friendlyText.ts:80`.

## Notes
- mion does NOT consume `createFriendlyText` (it removed its friendly-errors layer and delegates
  rendering to ts-runtypes), so there is no mion-side adaptation to make either way — this is purely
  a ts-runtypes design/doc decision.
- If **A**, this is a cross-cutting change (types + renderer + Go diagnostic + generated catalog +
  docs + 2 skills + tests) and needs its own PR + FE/Go tests.

## What shipped (Option B)

- **Renderer** (`packages/ts-runtypes/src/enrich/createFriendlyText.ts`, `renderErrors`): when a path
  group's effective node is in `rt$default` mode, emit exactly ONE `FriendlyMessage` for the whole
  field instead of one per failed constraint. The effective node is resolved with the cross-map
  precedence (root/translation first, else source), and the single message renders the `rt$default`
  template using the group's FIRST error for any `$[val]` / format-driven interpolation. Per-constraint
  mode, plural handling, and i18n fallback for non-default nodes are unchanged.
- **Docs**: `docs/AI_ENRICHMENT.md` §`rt$default` reconciled with `friendlyText.ts:80` — both now say
  ONE message per field.
- **Skills**: `packages/ts-runtypes/skills/runtypes-friendly-type/SKILL.md` wording that implied a
  message per failure was corrected to "one message for the whole field".
- **Tests** (`packages/ts-runtypes/test/suites/enrich/createFriendlyText.test.ts`): the multi-constraint
  `rt$default` test now asserts exactly ONE message; added a test locking the FIRST-error `$[val]`
  interpolation. The i18n `rt$default` tests (single-error) stay green.
