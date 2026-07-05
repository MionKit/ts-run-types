# Code Simplification & Reduction Review — Guidelines + How-To

A practical playbook for reviewing a repository with the explicit goal of making it **smaller and simpler** without breaking it. Grounded in established industry thinking (Google's engineering practices, Tef's "easy to delete" essay, Sandi Metz on abstraction, Kent Beck's _Tidy First?_) and modern JS/TS tooling.

---

## Part 1 — Guiding principles

These are the mental models the whole review runs on. Read them once; they resolve 90% of "should this stay or go?" decisions.

**1. Every line of code is a liability, not an asset.**
Code is written once and maintained forever. The goal isn't to _have_ code, it's to _solve the problem_ — ideally with the least code that a future reader can still understand. "The best code is no code."

**2. Optimize for deletability, not extensibility.**
Tef's maxim: _write code that is easy to delete, not easy to extend._ Premature reuse and speculative generality ("we might need this later") are the main sources of bloat. Self-contained, slightly-duplicated code that you can rip out in one commit beats a clever abstraction that has grown tentacles into 40 files.

**3. The wrong abstraction is more expensive than duplication.**
Sandi Metz's rule. When you find an abstraction that everyone works _around_ rather than _with_ (lots of flags, options, special cases, `if (mode === ...)`), the simplifying move is often to **inline it back into duplication** and then re-extract the _right_ seam — or leave it duplicated. Two or three similar copies are cheaper than one abstraction that fits none of the callers.

**4. Simpler = healthier, not perfect.**
Google's standard of review: approve a change when it _improves the overall health of the system_, even if it isn't perfect. Apply the same bar to yourself. You're not chasing a theoretical ideal; each pass just has to leave the repo cleaner than you found it. Perfect is the enemy of shipped.

**5. Reduction is a behavior-preserving change.**
Simplification should not change what the software does. If you find yourself "improving behavior while you're in there," stop — that's a separate change for a separate commit (see Kent Beck's _Tidy First?_: never mix structural changes with behavioral ones).

---

## Part 2 — Safety rules (read before deleting anything)

Reducing code is high-leverage but easy to do recklessly. These rules keep it safe.

**Chesterton's Fence.** _Don't remove a fence until you understand why it was put there._ Before deleting any non-obvious code, find out why it exists: `git blame` / `git log -p` the lines, read the linked issue/PR, search for the failing edge case it was patching. A weird-looking guard clause is often a bug fix in disguise. If you genuinely can't find a reason after looking — that's a strong signal it's safe to remove, but you looked first.

**Tests are the safety net; establish it before you cut.** You can only aggressively delete code you can prove still works. If a region has no test coverage, add a _characterization test_ first (a test that pins current behavior, even if that behavior is weird), then simplify underneath it. For a framework/validation library this matters doubly — your fuzz/property harness is exactly the tool that lets you delete confidently.

**Separate structural from behavioral changes — in separate commits.** A commit should either change _what the code does_ or change _how it's shaped_, never both. This keeps diffs reviewable and makes reverts surgical. Structural (rename, move, extract, inline, delete-dead) commits should be provably behavior-neutral.

**Small, reversible steps.** Prefer many tiny commits over one heroic "simplification" PR. Each step should keep the build green, types passing, and tests passing. If a step is scary, it's too big — split it.

**Delete, don't comment out.** Commented-out code and `@deprecated` tombstones are just dead code with extra noise. Version control is your archive. Remove it entirely.

**One caveat for a public API / framework:** deletion of _exported_ surface is a breaking change for your users, not just internal cleanup. Split your mental model into two buckets:

- **Internal code** → delete freely once proven unused.
- **Public API surface** → simplification means _deprecate → document → remove on a major version_, not delete-on-sight. Track these separately.

---

## Part 3 — The how-to: running the review in passes

Don't try to see everything at once. Do multiple focused passes, cheapest and safest first. Let tools do the mechanical work so your judgment is spent on the hard calls.

### Pass 0 — Baseline & guardrails (do this once, up front)

- Ensure the build, typecheck, and full test suite are green. This is your reference point.
- Record baseline metrics you'll simplify against: total LOC, file count, dependency count, bundle size, `tsc` time, test time. (`cloc` or `tokei` for LOC; your bundler's report for size.)
- Create a working branch. Everything below happens as small commits on it.

### Pass 1 — Automated dead-code sweep (mechanical, safest wins)

Machines find unused code faster and more reliably than you can, and this is where the biggest, safest reductions live.

**TypeScript / JavaScript**

- **`knip`** — the current best-in-class tool. Finds unused **files, exports, dependencies, devDependencies, class/enum members**, and duplicate exports across a monorepo. (`ts-prune` was the old standard but is now in maintenance mode; `knip` supersedes it and understands workspaces, which matters for a pnpm monorepo.)
  ```bash
  pnpm add -D knip
  npx knip                 # report
  npx knip --fix           # auto-remove unused exports (review the diff before committing!)
  ```
  Configure entry points carefully so public API and test-only exports aren't falsely flagged. Add a `knip.json` with your real entry files (`src/index.ts`, plugin entry, CLI, etc.).
- **`tsc --noUnusedLocals --noUnusedParameters`** — catches unused locals/params the linter and knip don't.
- **ESLint** (`no-unused-vars`, `no-unreachable`, `eslint-plugin-unused-imports`) for in-file dead code and unreachable branches.
- **`depcheck`** as a second opinion on unused dependencies.

**Go** (the ecosystem maps almost 1:1, and much of it is first-party)

- **`deadcode`** (`golang.org/x/tools/cmd/deadcode`) — the official Go-team tool, the closest analogue to knip's dead-export detection. It builds a call graph from your `main` entry points using Rapid Type Analysis and reports **unreachable functions across packages** — including exported ones, which the linters below miss.
  ```bash
  go install golang.org/x/tools/cmd/deadcode@latest
  deadcode ./...                       # report unreachable funcs
  deadcode -test ./...                 # include tests; funcs dead even here = also test-coverage gaps
  deadcode -whylive=pkg.Func ./...     # explain why something is considered live
  ```
  There is **no `--fix`** — it's report-only, so you delete by hand (which is arguably safer). Note the RTA caveat: it can't see through `go:linkname` or assembly, and it's analyzed for a single GOOS/GOARCH/`-tags` config, so re-run per build tag if you use them.
- **`staticcheck`** (the `unused` / `U1000` check, also bundled in golangci-lint) — catches unused **unexported** identifiers _within_ a package (functions, types, fields, consts). Complements `deadcode`: staticcheck for the package-local unexported stuff, `deadcode` for cross-package/exported reachability.
- **`go vet`**, **`ineffassign`** (assignments never read), **`unparam`** (unused function params/results), **`unconvert`** (redundant conversions) — the small-but-mighty in-file dead-code checks. All available through golangci-lint.
- **Monorepo / multiple entry points:** `deadcode` analyzes from _one_ main at a time, which gives false "dead" results in a repo where several services share internal packages. **`deadmono`** wraps `deadcode` and intersects across all your entry points, so a function is only reported dead if it's unreachable from _every_ binary that imports its package. Worth it if you have several `main`s (services + CLI).

**The library caveat (applies to both ecosystems, sharper in Go).** Reachability tools work forward from an entry point (`main`). A **pure library package has no `main`**, so its exported surface can never be proven dead — an external consumer might import it. This is the exact mirror of the public-API caveat from Part 2: for the _binary_ parts of mion (server, CLI) `deadcode` is gold; for the _library_ parts, `deadcode`/knip can only prove _unexported_ code dead, and trimming the exported surface is a deprecation-and-major-version decision, not an auto-delete. Point `deadcode` at your real binaries, not the library packages.

Commit the results in logical chunks: "remove unused files", "remove dead funcs", "remove unused deps", etc. Each chunk keeps the suite green.

### Pass 2 — Dependency reduction

Every dependency is code you don't control but still ship and maintain.

- For each remaining dependency, ask: _is this pulling its weight?_ A one-function helper (left-pad-style), a heavy lib used for one call, or a polyfill for a platform you no longer target → candidate for removal or inlining a few lines.
- Prefer the platform: modern Node/browser natives often replace date libs, fetch wrappers, lodash chains, uuid, etc.
- Check for **duplicate-purpose** deps (two date libs, two schema libs) and consolidate.
- Watch transitive weight and supply-chain surface — fewer deps is also a security win.
- **Tooling — TS:** `depcheck`, `knip` (both flag unused `package.json` deps). **Go:** `go mod tidy` removes unused module requirements from `go.mod`/`go.sum`; `go mod why <module>` tells you what's actually pulling a dep in; `depguard` (in golangci-lint) enforces an allow/block list so unwanted deps can't creep back; `govulncheck` flags deps you're keeping around that carry known vulns.

### Pass 3 — Duplication & the wrong-abstraction pass

Now the judgment work.

- Find near-duplicate blocks — **TS:** `jscpd`. **Go:** `dupl` (also in golangci-lint; tune `threshold` in tokens, ~100). But **don't reflexively DRY them** — apply principle #3. Only extract when the duplicates are truly the _same concept_ that will change together. If they merely look alike today, leave them. (`dupl` in particular throws false positives on same-shaped-but-different-meaning branches — read each hit, don't bulk-merge.)
- Hunt the _inverse_ problem: over-abstracted code. Signs — a function/class with many boolean flags or `options` that each caller uses differently; a base class one subclass uses; a "manager/helper/util" grab-bag; indirection you have to click through 4 files to understand. The simplifying move is often to **inline it back** to the call sites, then re-extract only if a real, single seam appears.
- Collapse needless indirection: wrappers that just call through, single-implementation interfaces, config for things that never vary.

### Pass 4 — Local simplification (function/module level)

Go file by file through the hot/complex areas (use a complexity metric to prioritize — see Pass 6).

- **Reduce nesting:** guard clauses / early returns instead of arrow-shaped `if` pyramids.
- **Shrink surface:** fewer exports, fewer params, fewer public methods. Narrow what's reachable.
- **Delete speculative generality:** parameters/branches/config that exist "just in case" but have exactly one real value in practice.
- **Simplify types** (TS-specific): collapse over-engineered generics and conditional types that no caller needs; replace clever type gymnastics with the simplest type that still type-checks the real usage. (Relevant to a types-as-source-of-truth library — but here, protect the _intentional_ type power that is the product, and only cut the _accidental_ complexity.)
- **Naming as compression:** a precise name can delete a paragraph of comments and a helper.
- **Let linters suggest simplifications.** **Go:** `gosimple` (part of staticcheck) proposes simpler equivalents of verbose constructs; `gocritic` catches redundant patterns; `gofumpt`/`goimports` and `staticcheck -fix` auto-apply many. **TS:** ESLint autofix + `eslint-plugin-unicorn`. Treat these as suggestions to review, not gospel.
- **To find _where_ to look:** run a complexity metric and start at the top. **Go:** `gocyclo` (cyclomatic) and `gocognit` (cognitive) — both in golangci-lint, report on functions above a threshold (start ~15 cyclomatic / ~20 cognitive). **TS:** ESLint `complexity` rule or `ts-complexity`.

### Pass 5 — Structural / architectural pass

Zoom out.

- **Dead features / feature flags** that are permanently on or off → collapse the branch, delete the loser.
- **Dead configuration surface**, unused build targets, unused CI matrix entries.
- **Module boundaries:** files/packages that always change together might merge; a package no one imports might go.
- **Documentation & examples** that describe removed behavior → update or delete (stale docs are negative-value).

### Pass 6 — Prioritize by risk × reward (do this continuously)

You can't and shouldn't simplify everything. Spend effort where it pays:

- Prioritize **high-churn + high-complexity** files — the code you keep paying to work around. (Tools like CodeScene do this "behavioral" analysis; you can approximate it with `git log` churn counts × a complexity metric.)
- Deprioritize stable, boring, never-touched code even if it's ugly. Ugly-but-untouched is cheap; ugly-but-hot is expensive.

---

## Part 4 — The review checklist

Run this against each file/module. "Yes" answers are simplification opportunities.

**Deletion candidates**

- [ ] Is this file/export/function imported anywhere real (not just tests)?
- [ ] Commented-out code, `@deprecated` shims, TODO-graveyards?
- [ ] Dead branches, unreachable code, permanently-fixed feature flags?
- [ ] Config/options/params with only one real value in practice?
- [ ] Dependencies not actually used, or replaceable by a few lines / a platform native?

**Complexity candidates**

- [ ] Deeply nested conditionals that early-returns would flatten?
- [ ] An abstraction callers work _around_ (many flags/special cases)?
- [ ] Indirection with a single implementation (interface, wrapper, base class)?
- [ ] Speculative generality — built for a future that hasn't arrived?
- [ ] Over-engineered types/generics beyond what real callers need?
- [ ] Duplication that is genuinely the _same concept_ (extract) vs. merely alike (leave)?

**Safety gates (must pass before the cut lands)**

- [ ] Do I understand _why_ this code exists (Chesterton's Fence checked via blame/issue)?
- [ ] Is behavior covered by a test — or did I add a characterization test first?
- [ ] Is this commit purely structural (no behavior change mixed in)?
- [ ] Is it a small, reversible step that keeps build + types + tests green?
- [ ] If it touches **public API**, is it going through deprecate→major rather than delete-on-sight?

---

## Part 5 — Anti-patterns (don't do these)

- **Big-bang refactor PR.** Thousands of lines, un-reviewable, un-revertable. Split it.
- **DRYing everything.** Forcing an abstraction onto superficially-similar code creates the expensive wrong abstraction. Duplication is often the cheaper, more deletable choice.
- **Simplify + behavior change in one commit.** Makes diffs unreviewable and bugs un-bisectable.
- **Deleting code you don't understand** because it "looks unused." Look first (Pass 1 tools + blame). Especially guard clauses and error handling.
- **Chasing a line-count number.** LOC is a rough signal, not a goal. Fewer, clearer lines beats fewest lines. Golfed code is complexity, not simplicity.
- **Gutting intentional complexity.** Some complexity is the essential difficulty of the problem (e.g. a validation/serialization core, a fuzz harness). Cut _accidental_ complexity; protect _essential_ complexity.

---

## Part 6 — Knowing when to stop / measuring success

Track before/after so "simpler" is real, not a feeling:

- **Size:** total LOC, file count, public-export count, dependency count, bundle size.
- **Speed:** typecheck time, test time, build time.
- **Complexity:** average/max cyclomatic complexity on the hot files; number of files you have to open to understand a feature.
- **Health:** tests still green, coverage held or improved, no new `any`/`@ts-ignore`.

Stop a pass when the remaining candidates are all either (a) intentional essential complexity, (b) public API that needs a proper deprecation cycle, or (c) low-churn code where the cleanup isn't worth the risk. Then ship the branch as a series of small merged PRs, not one monster.

---

## Quick-start (TL;DR)

1. Green baseline + record metrics. Branch.
2. Automated dead-code sweep in small commits — **TS:** `knip`, `tsc --noUnusedLocals`, ESLint. **Go:** `deadcode ./...` (+ `deadmono` for multi-binary monorepos), `staticcheck`, `golangci-lint`. Point reachability tools at real binaries, not library packages.
3. Prune dependencies — **TS:** `depcheck`/`knip`. **Go:** `go mod tidy` + `depguard`. Prefer platform/stdlib natives.
4. Attack the wrong abstractions (inline back), leave harmless duplication.
5. Flatten nesting, shrink surface, simplify types — highest-churn files first.
6. Collapse dead features/flags/config.
7. Gate every cut: Chesterton's Fence checked, test coverage present, structural-only commit, small & reversible, public API deprecated not deleted.
8. Compare metrics, ship as small PRs.

---

### Sources this is built on

- Tef, _Write code that is easy to delete, not easy to extend_ (programmingisterrible.com)
- Google Engineering Practices — _The Standard of Code Review_ ("improve overall code health")
- Sandi Metz — _The Wrong Abstraction_ ("duplication is cheaper than the wrong abstraction")
- Kent Beck — _Tidy First?_ (separate structural from behavioral change; small steps)
- Chesterton's Fence (understand-before-you-remove)
- Tooling (TS/JS): **knip** (`knip.dev`), ts-prune (maintenance mode), depcheck, jscpd, ESLint, `tsc` strict unused flags
- Tooling (Go): **`deadcode`** (`golang.org/x/tools`, Go blog "Finding unreachable functions with deadcode"), **`deadmono`** (monorepo multi-entry-point wrapper), **staticcheck** (Honnef, incl. `unused`/`gosimple`), **golangci-lint** (meta-linter aggregating gocyclo, gocognit, dupl, unparam, ineffassign, unconvert, depguard, gocritic, …), `go mod tidy`, `govulncheck`
- Cross-language: CodeScene (behavioral/churn analysis for prioritization)
