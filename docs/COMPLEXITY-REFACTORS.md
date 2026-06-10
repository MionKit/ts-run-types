# Go-side Complexity & Duplication Reduction — Analysis + Candidate List

> Status: analysis on branch `claude/cool-knuth-v8cldy` (post perf pass — see
> [PERF-OPTIMIZATIONS.md](PERF-OPTIMIZATIONS.md)). Sole goal: reduce code complexity and
> duplicated/very-similar Go code under [internal/](../internal/) + [cmd/](../cmd/). Behavior is
> pinned: emitted JS byte-identical (JS suites assert emitted strings), wire JSON byte-compatible,
> diagnostics text + disk-cache v4 unchanged, landed perf optimizations untouched.
> Statuses below are updated as steps land — one commit per candidate.

## Methodology

- Manual survey of all `internal/` packages (two passes: typefns family scaffolding; everything else).
- Tooling: `dupl` v1.1.0 (`-t 100`, token-level clone detection, non-test files), `gocyclo` v0.6.0
  (`-over 15`), `gocognit` v1.2.1 (`-over 20`). `golangci-lint` 2.5.0 could not run: its embedded
  go1.25 typechecker rejects the go1.26 module graph (`package requires newer Go version go1.26`).
- Every dupl clone pair was diffed byte-wise; only byte-identical (or name-only-diff) clones in the
  same/compatible packages qualify as merge candidates. Near-twins with semantic drift are rejected.
- Perf gate per landed step: `scripts/bench-compile.mjs --quick` compared against the
  `baseline-complexity` full run via `scripts/bench-compare.mjs` (floors ±3% time / ±1% alloc;
  regressions re-confirmed with a full run before reverting), plus
  `go test ./internal/resolver -bench=. -benchmem -run='^$' -count=6` on hot-path steps.

## Candidate table

| id | site | what | approach | est. LOC | risk | status |
| --- | --- | --- | --- | --- | --- | --- |
| S1 | `runtype/serialize.go:1416` + `runtype/typeid/typeid.go:530` | `stripUndefined` duplicated across the two packages | export `typeid.StripUndefined` (keep prealloc body), delete serialize copy | −17 | minimal | landed |
| S2 | `typefns/emitter.go:420` + `typefns/module.go:1238` | `joinComma` ≡ `joinArgs` (same package) | keep `joinArgs`, add len-0/1 fast paths, delete `joinComma` | −20 | low | landed |
| S3 | `formats/{string,datetime,numeric}/shared.go` | `formatErrCall` ×3, `formatNumber` ×2, `pureFnAlias` ×2 byte-identical | exported helpers in formats root (`formats/emit.go`) | −50 | low | landed |
| S4 | `purefns/walker.go:472` vs `resolver/scan.go:911` (+6 site-building blocks) | naive O(bytes) `lineCol` duplicates the optimized line-map `scanLineCol`; repeated Pos/End→`diag.Site` blocks | new tiny `internal/textpos`: `LineCol` + `NodeSite`; purefns gets the line-map win | −55 | low | landed |
| S5 | `typefns/module.go:206-356` | partial registry (`familyConfig` + `crossFamilyItSourceFamilies`) duplicates the wrapper triples | `FamilySpec` registry in `typefns/families.go` (order load-bearing, validate LAST) | +55/−45 | low | landed |
| S6 | `resolver/render.go` + `resolver/dispatch.go:295-312` | 11 trivial render wrappers; 14-line `Added*`/`AnyXxxSupported` block | drive renders + added-flags from the registry | −70 | medium | landed |
| S7 | typefns family files | 14 `XxxModule` + 14 `AnyXxxSupported` thin wrappers (sole callers: resolver, handled in S6) | delete; tests use `FamilyByKey(...)` | −280 | low | landed |
| S8 | `protocol/protocol.go:654-783` | ~45 repetitive conditional map-sets in `Response.MarshalJSON` | two hand-written closure tables + fill loops (keys NOT derived — wire definition) | −40 | low | landed |
| E1 | `unknownkeys_{errors:25,has:40,strip:21,to_undefined:20}.go` | 4 `Supports` bodies byte-identical (has differs by 2 comments; wire already delegates) | one shared `unknownKeysSupports`, 5 delegating methods | −135 | low | landed |
| E2 | `json_prepare.go:348-376` vs `json_restore.go:283-311` | `emitObjectPrepareForJson` ≡ `emitObjectRestoreFromJson` (name-only diff, same package) | single shared func; both emitters call it | −29 | low | landed |
| E3 | `typefns/quote.go:14` + `purefns/module.go:109`; `typefns/accessors.go:29` + `formats/string/pattern.go:152` | `quoteJS` ×2 and `quoteJSDouble` ×2 byte-identical cross-package copies (comments admit "copy to avoid cross-package edge") | tiny `internal/jsquote` leaf package; **runtype/module.go:338 `quoteJS` is a different impl (strconv.Quote escaping) — excluded** | −40 | low | landed |
| E4 | `unknownkeys_errors.go:185` vs `unknownkeys_strip.go:161` | 19-line helper pair, 2 diff lines | fold into `unknownkeys_shared.go` if name-only | −19 | low | landed (with E1) |

## Tool findings — clone groups (dupl -t 100), triage

| clone group | diff verdict | action |
| --- | --- | --- |
| `quote.go:14` / `purefns/module.go:109` / `accessors.go:29` / `formats/string/pattern.go:152` | two identical pairs (single-quote ×2, double-quote ×2); single↔double NOT mergeable | E3 |
| `unknownkeys_{errors,has,strip,to_undefined}` Supports | byte-identical (has: +2 comments) | E1 |
| `json_prepare.go:348` / `json_restore.go:283` | name-only diff | E2 |
| `json_prepare.go:528` / `json_restore.go:435` | byte-identical 14-line rest-tuple fragment inside the tuple emitters | covered by E2 review; fragment extraction deferred (parents diverge) |
| `binary_from.go:376` / `binary_to.go:490` | byte-identical 29-line *fragment* inside `emitObjectFromBinary`/`emitObjectToBinary` | deferred — fragment surgery inside two 40+-complexity funcs, drift risk |
| `unknownkeys_errors.go:185` / `unknownkeys_strip.go:161` | 2 diff lines | E4 |
| `validate.go:48` / `validationerrors.go:52` Supports | 20 diff lines — real semantic drift | rejected (per-family gates differ) |
| `json_{prepare,restore,stringify}` Supports | lengths 83/57/48 — structural similarity only | rejected |
| `validate.go:819/843`, `validate.go:1148`/`validationerrors.go:651`, `json_restore.go:314`/`validate.go:1238`, `unknownkeys_errors.go:282/299`, `validationerrors.go:952/981` | 16-22 diff lines — Set/Map or key/value twin arms with family-specific emitted strings | rejected (emit drift risk for marginal LOC) |
| `class_serializer.go:89/185`, `:215/244` | 4 diff lines each — To/From twins | deferred (small win, emit-adjacent) |
| `formats/datetime/date.go:97` / `time.go:82` | 6 diff lines (format name + per-format lookups) | deferred — parameterizable but datetime twins are emit-adjacent |

## Tool findings — complexity (gocyclo > 15 / gocognit > 20), top entries

72 functions over the cyclomatic threshold; the top of the list is dominated by **flat kind-dispatch
switches and the render engine** — reviewed and intentionally kept:

| function | cyclo/cognit | verdict |
| --- | --- | --- |
| `resolver.dispatch` 55/93 | op switch + per-op prep; S6 trims the family block; rest is protocol surface | keep |
| `typefns.RenderFnModule` 44/89 | the render engine (worklist + fixpoint + topo); recently perf-optimized | keep |
| `resolver.analyzeCall` 44/68 | marker-scan hot path (perf-critical, recently split into analyze/commit) | keep |
| `Validate/ValidationErrors emitKindDefault` 43/42 | per-kind emit switch = the family's dispatch table | keep |
| `protocol.Response.MarshalJSON` 43 | repetitive, not branchy | fixed by S8 |
| `runtype.projectType` 32, `typeid.objectID` 27/47 | hot-path kind switches; complex kinds already delegate | keep |
| `union_flat*` emitters 49-55 cognit | wire-layout codegen; shared layout already factored | keep |

## Rejected candidates (do not chase)

- Table-ifying `projectType` / `typeid.dispatch` kind-switches — arms are 1-3 lines, complex kinds
  already delegate; the flat switch IS the dispatch table; both are hot paths.
- Merging `joinAnd`/`joinOr`/`joinSemicolons` — filtering/parens/separator semantics genuinely
  differ; a parameterized join would be longer and less readable at call sites.
- Single-pass fold of the 14 `Supports` passes — evaluated and declined in PERF-OPTIMIZATIONS.md;
  the registry keeps per-family passes (identical execution profile).
- Cross-family `Supports()` kind-set sharing and shared atomic-emit stubs — per-family gates and
  emitted strings genuinely differ; drift risk on emitted JS for marginal LOC.
- `unknownkeys_*` / `union_flat_*` structural merging — already well-factored via shared files.
- Merging `runtype/module.go:338 quoteJS` into the shared helper — it is `strconv.Quote`-based
  (escapes non-printables/unicode differently); folding it would change emitted cache-module bytes.

## Result summary

(filled in as steps land)

| step | commit | LOC delta | bench verdict |
| --- | --- | --- | --- |
| S1 | refactor(typeid): share StripUndefined with the serializer | −17 | neutral (wall +2.1%, go −0.8%, alloc +0.0%) |
| S2 | refactor(typefns): fold joinComma into joinArgs | −20 | neutral (wall +2.7%, go −0.8%, alloc −0.0%) |
| S3 | refactor(formats): share FormatErrCall/FormatNumber/PureFnAlias in the formats root | −60 | neutral (wall −2.7%, go −3.4%, alloc 0.0%) |
| S4 | refactor(textpos): shared LineCol/NodeSite for resolver + purefns | −60 | neutral (wall +0.8%, go +0.4%, alloc 0.0%) |
| S5 | refactor(typefns): introduce the FamilySpec registry | +100/−55 | neutral-to-better (wall −2.9%, go −7.4%, alloc −0.0%) |
| S6 | refactor(resolver): drive family renders and added-flags from the registry | −75 | neutral (wall +0.3%, go −1.0%, alloc +0.2%) |
| fix | fix(resolver): keep the transform-gated AddedFormatTransform signal | +3 | n/a (semantic guard; new regression test in families_test.go) |
| S7 | refactor(typefns): drop the per-family Module/AnySupported wrappers | −245 | neutral (wall −0.3%, go −0.9%, alloc +0.1%) |
| S8 | refactor(protocol): table-driven Response.MarshalJSON | −35 | neutral (wall −0.9%, go −4.7%, alloc +0.2%) |
| E1+E4 | refactor(typefns): share the unknownkeys Supports gate + tuple recursion | −160 | neutral (wall −1.5%, go −2.3%, alloc +0.2%) |
| E2 | refactor(typefns): merge the twin JSON object child walks | −31 | neutral (shared bench with E3) |
| E3 | refactor(jsquote): one canonical JS string-literal quoter | −55 | neutral (wall −1.9%, go −4.9%, alloc +0.2%) |
