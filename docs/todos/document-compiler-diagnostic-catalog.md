# Document every compiler diagnostic in the website docs

**Status:** idea, not started. Captured as a scoping note for a future session;
no design committed, no code touched.

The idea: surface the **entire diagnostic catalog** — every code the Go
resolver and the Vite plugin can emit at build time — as a first-class section
of the website docs, so a user who hits e.g. `PFE9008` in their terminal can
click the code and land on a page that explains what triggered it, why it's
the rule, and how to fix it.

## Why this is worth doing

We emit ~95 distinct diagnostic codes today
([`packages/vite-plugin-runtypes/src/diagnosticCatalog.ts`](../../packages/vite-plugin-runtypes/src/diagnosticCatalog.ts)
+ Go-side codes under
[`internal/diag/`](../../internal/diag/)). They cover the marker scanner
(`MKR0xx`), `CompTimeArgs` literal validation (`CTA0xx`), pure-function purity
(`PFN001` + `PFE90xx`), format constraints (`FMT0xx`), and the per-family
"will throw at runtime" diagnostics for JSON / binary / validate
(`PJ0xx` / `PJS0xx` / `RJ0xx` / `TB0xx` / `FB0xx` / `VL0xx` / `VE0xx` / …).

The catalog file has a short `headline` per code, but **none of these codes
are documented anywhere the user can read**. The website
([container-website/content/](../../container-website/content/)) has zero
matches for any of them. The terminal headline tells the user *what* happened;
nothing tells them *why* the rule exists or *what to change*. For a build-time
tool whose value proposition is "the compiler catches the bug before runtime,"
opaque codes are a real wart on the user experience.

The codes also have a soundness contract that's easy to lose track of —
**Warning** = expected drop (a non-serialisable property silently skipped),
**Error** = will throw at runtime, build halts (see
[CLAUDE.md → validate contract](../../CLAUDE.md#validate-contract--serializable-data-only)).
Without docs, users hit a `VL010` warning and don't know whether to treat it
as a bug in their type or an intentional projection. Surfacing the contract
*next to* the code makes the right call obvious.

## What to inventory

The list below is the seed — the agent's first job is to harden it by
exhaustively walking the diagnostic-catalog files and matching every code on
both sides (TS-side `diagnosticCatalog.ts` and Go-side `internal/diag/codes_*.go`)
to confirm we cover every code emitted today.

### A. TS-side catalog

Source:
[`packages/vite-plugin-runtypes/src/diagnosticCatalog.ts`](../../packages/vite-plugin-runtypes/src/diagnosticCatalog.ts).
Each entry has a `headline` template + (sometimes) a `detail` template.
Approximate code families today:

- `FMT0xx` — format-constraint validation (e.g. `int8` upper bound, regex
  shape).
- `MKR0xx` — marker scanner (call-site shape, generic arity, marker module
  resolution).
- `CTA0xx` — `CompTimeArgs<T>` literal validation (object literal,
  resolvable identifiers, no spreads, recognized field names).
- `PFN001` — pure-fn marker placement / call-site shape.
- `TMP0xx` — Temporal types (allowed subKinds, type-format constraints).
- `PFE90xx` — pure-fn purity violations (this, await, yield, generator,
  outer captures, dynamic imports, eval, body hash collision, destructured
  param).
- `PJ0xx` / `PJS0xx` / `RJ0xx` / `SJ0xx` — JSON family root-throws.
- `TB0xx` / `FB0xx` — binary family root-throws.
- `VL0xx` / `VE0xx` — validate / validation-errors silent drops + throws.
- `HUK0xx` / `SUK0xx` / `UKE0xx` / `UKU0xx` — unknown-key family.
- `OVR0xx` — reserved for the override todo
  ([optional-type-fucntions.md](optional-type-fucntions.md)) — not present
  yet, but the prefix is named in that scoping note.

### B. Go-side codes

Source: [`internal/diag/codes_*.go`](../../internal/diag/) (marker / purefn /
runtype / temporal). These are the constants the resolver ATTACHES to
diagnostics it ships back over the wire; the TS-side catalog rehydrates them
into messages. The website doc should be the single source of truth on what
each code MEANS — the TS catalog has the templates, the Go side has the
codes, the website page reconciles both.

### C. The codes that DON'T exist yet but probably will

Worth listing under "reserved" so future work doesn't reinvent prefixes:

- `OVR0xx` — per-type function overrides
  ([optional-type-fucntions.md](optional-type-fucntions.md)).
- An eventual code family for **plugin-option validation errors** (unknown
  key, conflicting `moduleMode` + `inlineMode`, mismatched
  `cacheDir`/`workspace`). Likely `CFG0xx`; pin the prefix now even if the
  todo for it
  ([expose-go-compiler-constants-via-tsconfig-plugin.md](expose-go-compiler-constants-via-tsconfig-plugin.md))
  doesn't land soon.

## What each diagnostic page should contain

For each code, the docs page should explain:

1. **Headline** — the exact terminal message, so search lands here on a
   copy-paste.
2. **Severity** — Warning vs Error, with the contract reminder ("Warning =
   expected drop, fine; Error = will throw at runtime, build must fail").
3. **What triggers it.** One paragraph, plain language, no internal jargon.
   No "side-channel," no "fixpoint," no "demand-driven cache."
4. **Why the rule exists.** The soundness / contract reason. For PFE codes
   this is "purity makes the body cacheable"; for VL/VE root throws it's
   "non-serialisable at a propagating position has no JSON-shaped
   projection."
5. **How to fix it.** Concrete user actions: rename the field, add a
   `DataOnly` projection, lift the capture out of the pure fn, use the
   `pure` helper, etc. Code samples where they help.
6. **Cross-links.** A `VL010` page links to the validate contract; a
   `PFE9007` page links to the pure-fn guide; a `FMT0xx` page links to
   `2.type-formats.md`. Use markdown links, not bare URLs.

## Where the pages live

A new section under
[container-website/content/](../../container-website/content/) — proposed
`8.diagnostics/` (or fit into the existing `2.guide/` if the count stays
small; ~95 codes argues for its own section). One of:

- **One page per code.** Easiest to deep-link
  (`/diagnostics/PFE9008`), worst to scan visually.
- **One page per family** (`MKR`, `CTA`, `PFE9*`, `VL`, …). Easier to
  read. Deep-links use anchors (`/diagnostics/purity#PFE9008`). Probably
  the right answer — the families are tight and the codes are short.
- **One single big "Diagnostics catalog" page** with a sticky TOC. Easiest
  to ship; worst for SEO.

Pick after a quick mock-up of the family page; the family layout is the
most likely answer.

The page generator could derive the headlines + severities directly from the
TS-side catalog file (it already has them), so the website stays in sync as
new codes are added. The hand-written part is the "what triggers, why,
how to fix" prose.

## Where the website voice rules apply

These pages are PROSE-heavy, so the
[CLAUDE.md → Website docs style](../../CLAUDE.md#website-docs-style-container-websitecontent)
rules really matter. The big four:

- **No dashes chaining clauses or sentences.** No em-dash, en-dash, `--`, or
  spaced single `-` as punctuation; use commas / periods / parentheses.
  Hyphenated words (`build-time`) and dashes inside code or flags are fine.
- **Plain, user-focused language.** Say what the rule does for the reader
  and why; cut the internals (hashing, byte offsets, "fixpoint",
  "side-channel").
- **Prefer fenced code blocks over heavy inline `code`.** Inline backticks
  for type names + flag names; everything else in fences.
- **Short frontmatter `description`** (one sentence, ~100 chars).

Linting helpers (an ESLint/markdownlint rule for em-dashes, or a quick CI
grep) would be a good follow-on, since this is the section where dash drift
is most likely.

## Open questions (decide before writing)

1. **Generator vs. hand-written.** Do we ship a small script that consumes
   `diagnosticCatalog.ts` and renders the headline+severity scaffolding,
   then commits the file for humans to fill in the prose? Or do we write
   each page by hand and accept manual drift? Likely answer: scaffold the
   headline/severity from the catalog (single source of truth), prose stays
   hand-edited.
2. **In-terminal link.** Today the plugin's `renderHeadline` prints
   `[<code>] <message>`. Should the printer ALSO emit a docs URL
   (`see https://…/diagnostics/<family>#<code>`), gated behind a plugin
   option? Adds value but pins a public URL forever; defer until the docs
   pages exist and have a stable URL shape.
3. **Severity migrations.** A few codes are currently Warning but the
   roadmap (CLAUDE.md → validate contract → "Future direction") suggests
   tighter modes that promote them to Error. Doc each code's severity as
   "today" with a note when a future option may upgrade it; don't promise
   the migration on the page.
4. **Translation / localisation.** Out of scope for now; pin English-only.
   If we ever localise, the catalog scaffolding becomes the natural anchor.
5. **Per-family colour coding / icons** on the diagnostic page. Out of
   scope; do not block the docs on visual design.

## Sketched approach

1. **Catalog read.** Walk `diagnosticCatalog.ts` + `internal/diag/codes_*.go`;
   produce a single CSV-like table of `<code>, <family>, <severity>,
   <headline>`. Sanity-check that every TS-side code has a Go-side
   counterpart (or is purely plugin-emitted) and vice versa.
2. **Section scaffold.** Create `container-website/content/8.diagnostics/`
   with one page per family. Each page is a header + a list of codes; each
   code is a `### <code>` anchor + the four bullets above (severity, what
   triggers, why, how to fix). Frontmatter `description` is one sentence
   per family.
3. **Cross-links.** Add a "Diagnostics" link to the website nav. Cross-link
   `2.guide/5.validation.md` ↔ `8.diagnostics/validate.md`, etc. The
   target todo for plugin-options docs
   ([expose-go-compiler-constants-via-tsconfig-plugin.md](expose-go-compiler-constants-via-tsconfig-plugin.md))
   should also cross-link `CFG0xx` once it exists.
4. **In-terminal hint (optional, gated).** A `printDiagnosticsLinks?:
   boolean` plugin option (default off) that appends the docs URL after
   each printed diagnostic. Behind a flag so it doesn't change today's
   terminal output for anyone not opting in.

## Documentation impact (when this lands)

- `container-website/content/8.diagnostics/` (or wherever the section
  lands) — the body of this todo.
- Cross-references from every existing guide page that mentions a behaviour
  the diagnostics describe (validate / pure-fn / type-formats / Temporal /
  JSON / binary). Light touch; don't bloat the guide pages.
- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — the per-family soundness
  contracts (already mentioned for validate) should be linked from the
  diagnostic pages, not re-explained on them.
- [`README.md`](../../README.md) — add one sentence in the project pitch
  mentioning "every build-time diagnostic is documented" with a link, once
  the section exists.

## Not in scope here

- Changing the SEVERITY of any existing diagnostic. Severity bumps are real
  semver moves and have their own conversation; this todo is documentation.
- Renaming or merging existing codes. The current namespace is stable; even
  if some families overlap (e.g. PJ vs PJS), they emit at different points
  and document differently.
- Adding new diagnostics. If the docs pass surfaces a missing diagnostic
  (something the compiler could catch but doesn't), file a separate
  ticket; do not bundle it here.
- Localisation; see open question (4).
