# Lint rules regrouped by diagnostic family (drop error/warn/info tier rules)

**Status:** SHIPPED on branch `linting-zero-config`. Family rules replace
`runtypes/error|warn|info`; routing is prefix→family + severity tier split, driven
by the `RULE_SPECS` single-source table; the generated catalog now carries
`severity` and a 148-code coverage test guards Go↔JS drift.

**Final shipped names (renamed from the `<family>` / `<family>-warn` scheme this
spec was written in, per follow-up feedback — rules describe what they catch, not
severity; and `validate` absorbs `validationErrors`):** `invalid-marker` /
`redundant-marker`, `pure-functions`, `validate-non-serializable` /
`validate-skipped-member`, `json-non-serializable` / `json-skipped-member`,
`binary-non-serializable` / `binary-skipped-member`, `clone-unsupported-type` /
`clone-shared-reference`, `unknown-keys`, `format`, `invalid-override` /
`override-side-effect`, `non-enumerable`, `class-serializer`, `other`,
`no-enrichment-todo`, `no-orphan-carcass`, `enrichment-field` /
`enrichment-message`, `enrichment-broken-source` / `enrichment-misplaced-file`
(24 rules). The tables below capture the family-grouping DESIGN; read the rule
names as the descriptive pairs above. The website [linting page](../../container/website/content/2.guide/9.linting.md) is the live reference.
**Branch:** `linting-zero-config` (follows [`lint-plugin-zero-config.md`](lint-plugin-zero-config.md))
**Created:** 2026-07-18

## Motivation (owner decision)

Today the plugin's compiler diagnostics route into three severity-tier rules —
`runtypes/error`, `runtypes/warn`, `runtypes/info`. The owner's call: those names
carry no information ("having runtypes/error, runtypes/warn and runtypes/info
doesn't make any sense"). Instead:

- **Group lint rules by the same error families that exist in Go** (the code-prefix
  families of `ts-go-runtypes/internal/diagnostics`: VL, VE, MKR, FMT, TB/FB, …).
- **Severity is the linter's job.** The plugin maps each diagnostic to its family
  rule; whatever level the user configures on that rule is what the host applies.
  That is automatic in both OXlint and ESLint once routing is family-based — the
  host owns rule severity, the plugin only reports.
- **No compiler change.** Build-lane behaviour (which codes are Error vs Warning,
  what fails a build) stays exactly as it is. The Go catalog's severities become
  the *defaults* in the plugin's recommended config.
- Where a family emits at more than one severity, **split the family by tier**
  (`<family>` + `<family>-warn`) so each rule maps to exactly one default level
  and can be re-levelled individually without dragging the other tier along.

## Investigation facts (verified 2026-07-18)

- **Severity is fixed per code.** `diagnostics.New()` looks Family/Severity up from
  the registered `Definitions` map ([catalog.go](../../ts-go-runtypes/internal/diagnostics/catalog.go));
  emitters cannot vary severity per emission. So a static code→rule map is sound.
- **The suffix convention is the tier split already**: within each prefix family,
  `001–009` are root-position Errors (factory throws / build fails), `010+` are
  child-position Warnings (silent drops made visible), `02x` special warnings.
- **There are ZERO Info-severity codes registered today.** `runtypes/info` routes
  nothing. No `-info` rules are needed; if Go ever registers an Info code the same
  pattern extends (`<family>-info`, default `off`).
- 148 codes across 22 prefixes (inventory below). The wire `Family` byte
  (PureFn/Marker/RunType/Enrich) is coarser than the prefix families and is only
  useful as a fallback route for unknown codes.
- The lint-lane-synthesized FMT001 (real-regex check of RE2-unchecked patterns,
  [lint-worker.ts](../../packages/ts-runtypes-devtools/src/eslint/lint-worker.ts))
  routes by its code like any other diagnostic — it lands in the format rule
  automatically instead of today's generic `runtypes/error`.

## Full inventory — Go prefix families and their catalog severities

| Prefix | Meaning | Error codes | Warning codes |
| --- | --- | --- | --- |
| MKR | marker scanner | 003, 006, 007 | 001, 004, 005 |
| CTA | CompTimeArgs literals | 001–004 | — |
| PFN | PureFunction marker | 001, 002 | — |
| TMP | Temporal lib missing | 001 | — |
| PFE | pure-fn extraction | 9004–9013 | — |
| VL | validate | 001, 002 | 010–015, 021 |
| VE | validationErrors | 001, 002 | 010–013, 015, 020 |
| PJ | prepareForJson | 001–005 | 010–015 |
| PJS | prepareForJsonSafe | 001–005 | 010–015 |
| RJ | restoreFromJson | 001–005 | 010–015 |
| SJ | stringifyJson | 001–005 | 010–015 |
| JCP | JSON composite invariant | 001 | — |
| TB | toBinary | 001–006 | 010–015 |
| FB | fromBinary | 001–006 | 010–015 |
| CES | cloneExactShape | 001, 003 | 010, 011, 012, 015 |
| HUK/UKE/UKU/UKW | unknown-keys group | — | 010 each |
| FMT | type formats | 001–004 | — |
| OVR | overrideX registrations | 001, 002 | 010 |
| NE | @nonEnumerable | 001 | — |
| CLS | class serializer advisory | — | 001 |
| FT | FriendlyText mirrors | 002, 006, 009, 011, 020, 021, 022 | 003, 005, 007, 008 |
| MD | MockData mirrors | 001, 011, 020, 021, 022 | — |
| GE | enrichment gen/check | 000, 002, 003 | 001 |

## Proposed rule set (25 rules)

Rule granularity: **user-facing product family**, not raw prefix — the four JSON
primitives (PJ/PJS/RJ/SJ) and the JSON composite (JCP) fold into one `json` rule,
TB+FB into `binary`, the four unknown-keys prefixes into `unknown-keys`, and the
marker-scanner prefixes (MKR/CTA/PFN/TMP) into `marker`. The precise code (e.g.
`[SJ010]`) stays in every message, so per-code disable comments and lookups still
work. (Open question 1 offers the strict per-prefix alternative.)

### Compiler rules

| Rule | Default | Codes |
| --- | --- | --- |
| `runtypes/marker` | error | MKR003 MKR006 MKR007 · CTA001–004 · PFN001–002 · TMP001 |
| `runtypes/marker-warn` | warn | MKR001 MKR004 MKR005 |
| `runtypes/pure-functions` | error | PFE9004–9013 |
| `runtypes/validate` | error | VL001 VL002 |
| `runtypes/validate-warn` | warn | VL010–015 VL021 |
| `runtypes/validation-errors` | error | VE001 VE002 |
| `runtypes/validation-errors-warn` | warn | VE010–013 VE015 VE020 |
| `runtypes/json` | error | PJ001–005 PJS001–005 RJ001–005 SJ001–005 JCP001 |
| `runtypes/json-warn` | warn | PJ010–015 PJS010–015 RJ010–015 SJ010–015 |
| `runtypes/binary` | error | TB001–006 FB001–006 |
| `runtypes/binary-warn` | warn | TB010–015 FB010–015 |
| `runtypes/clone` | error | CES001 CES003 |
| `runtypes/clone-warn` | warn | CES010–012 CES015 |
| `runtypes/unknown-keys` | warn | HUK010 UKE010 UKU010 UKW010 |
| `runtypes/format` | error | FMT001–004 |
| `runtypes/overrides` | error | OVR001 OVR002 |
| `runtypes/overrides-warn` | warn | OVR010 |
| `runtypes/non-enumerable` | error | NE001 |
| `runtypes/class-serializer` | warn | CLS001 |

### Enrichment rules (keep concern names, add the tier split)

The four concern rules stay — the concern split (todo / orphan / field / drift) is
the enrichment analogue of the family grouping and is what a team actually gates
on. They gain the same tier consistency: concerns that mix severities split.

| Rule | Default | Codes |
| --- | --- | --- |
| `runtypes/no-enrichment-todo` | error | FT020 MD020 |
| `runtypes/no-orphan-carcass` | error | FT021 FT022 MD021 MD022 |
| `runtypes/enrichment-field` | error | FT002 FT006 FT009 FT011 · MD001 MD011 |
| `runtypes/enrichment-field-warn` | warn | FT003 FT005 FT007 FT008 |
| `runtypes/enrichment-drift` | error | GE000 GE002 GE003 |
| `runtypes/enrichment-drift-warn` | warn | GE001 |

`runtypes/error`, `runtypes/warn`, `runtypes/info` are **removed** (breaking for
existing lint configs; pre-1.0, and the recommended config carries users).

## Implementation plan

1. **[diagnosticRouting.ts](../../packages/ts-runtypes-devtools/src/eslint/diagnosticRouting.ts)** —
   replace severity-tier routing with: strip trailing digits → prefix → rule base
   (static `PREFIX_TO_RULE` map); tier from the diagnostic's severity (Warning and
   a `-warn` twin exists → `<base>-warn`, else base rule). Enrichment prefixes keep
   the concern switch (code → concern), then apply the same tier suffix.
   `RuleName` union + `ALL_RULE_NAMES` regenerate from the table.
2. **Fallback (never drop a diagnostic):** unknown prefix routes by wire family —
   Marker→`marker`, PureFn→`pure-functions`, Enrich→`enrichment-field`,
   RunType→`runtypes/other` (new catch-all, default error, in recommended; only
   reachable when a locally built binary runs ahead of the catalog). *(Counts as
   rule 26 if kept — see open question 3.)*
3. **[index.ts](../../packages/ts-runtypes-devtools/src/eslint/index.ts)** — build
   the `rules` record from a declarative table (name, description, gate) instead of
   seven hand-written entries. Gates: compiler rules → `needsResolverPass`,
   enrichment rules → `looksLikeEnrichmentFile`. `engineErrorClaims` (one engine
   error per file) unchanged. Update `configs.recommended` to list every rule at
   its default.
4. **gen:diag-catalog** — extend the generated
   [diagnosticCatalog.generated.ts](../../packages/ts-runtypes-devtools/src/go-generated/diagnosticCatalog.generated.ts)
   entries with `severity` (and `family`) so the JS side carries the Go defaults.
   Add a sync test: every catalog code resolves to a mapped rule whose tier matches
   its catalog severity (catches a new Go prefix or a severity move at PR time).
5. **Tests** — rewrite [routing.test.ts](../../packages/ts-runtypes-devtools/test/eslint/routing.test.ts)
   expectations to the new rule names; update plugin.test.ts (rule-name driven
   assertions: MKR001→`marker-warn`, MKR003→`marker`, VL011→`validate-warn`,
   FMT001→`format`, FT020→`no-enrichment-todo` unchanged, FT003→`enrichment-field-warn`);
   oxlint-e2e asserts the new `runtypes(<rule>)` ids; add the catalog-coverage sync
   test from (4).
6. **Docs** — the linting page Rules table regenerates with the new names +
   Default column (already has the column). Setup examples: ESLint gains the
   `runtypes.configs.recommended` one-liner (25 rules is too many to hand-list);
   OXlint gets its own one-liner too — verified (oxlint 1.68): it has no
   ESLint-style plugin presets, but `extends` takes config FILE paths resolved
   relative to the extending file, so the package ships `oxlint-recommended.json`
   (jsPlugins + every rule at its RULE_SPECS default; pinned by a sync test in
   plugin.test.ts and an extends e2e in oxlint-e2e.test.ts) and users write
   `"extends": ["./node_modules/@ts-runtypes/devtools/oxlint-recommended.json"]`.
   The diagnostics website page can later link codes → rules from the same
   generated severity data.

## What does NOT change

- Go catalog codes, severities, build-lane gating, `failOnError` — untouched.
- The single resolver pass per file, prefilter gates, session bridge, prewarm.
- Message format `[CODE] headline` (per-code disable comments keep working).
- Zero-config resolution (binary/cwd) from the previous spec.

## Resolved decisions (owner, 2026-07-18)

1. **JSON granularity** — RESOLVED: one `runtypes/json(-warn)` pair for
   PJ/PJS/RJ/SJ/JCP. Users reach these through `createJsonEncoderFn/Decoder`; the
   precise code stays in the message.
2. **Enrichment** — RESOLVED: keep the concern-named rules with the tier split
   (table above). The concern gate granularity stays.
3. **Catch-all** (implementation-time, minor) — default to a `runtypes/other`
   fallback rule (default error, in recommended) for unknown RunType prefixes;
   only reachable when a locally built binary runs ahead of the catalog. If it
   proves noisy in review, folding into `runtypes/marker`-style wire-family
   routes is the alternative.

## Done criteria

- `runtypes/error|warn|info` gone; 25(+1) family rules shipped with defaults
  mirroring the Go catalog severities.
- Catalog-coverage sync test green (every code → mapped rule, tier = severity).
- `configs.recommended` and both website examples updated; rules table lists
  every rule with its default.
- Full lint suite + oxlint e2e green.
