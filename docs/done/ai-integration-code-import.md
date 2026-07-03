# Compiled examples for the AI-integration docs — `<code-import>` + a typecheck gate

> **Status: SHIPPED — implemented as specced on the
> `claude/friendlytypes-i18n-l8e2y3` branch (PR #166).** Bonus findings from
> the first-ever compile of the examples tree: 15 pre-existing doc bugs
> (comptime options passed in the value slot instead of the second argument
> across the guide examples; encoder results used as plain strings), plus two
> doc-vs-DSL mismatches the new enrich examples surfaced (TF.Email also
> declares minLength/maxLength, so friendly maps need those keys; MockData
> number/Date nodes REQUIRE `pool` with min/max as refinements — matching what
> the generator actually emits). All fixed in the same pass.

## Motivation (decided in design dialogue, 2026-07-03)

The `3.ai-integration/` website pages hand-write every code example (62 fences,
zero imports) while the guide pages and the home page import real files via
`<code-import>` / twoslash. Hand-written examples silently drift — the `rt$`
meta-key rename caught every one of them stale. Imported examples are real
`.ts` files, so the TYPE CHECKER becomes the drift alarm: the param-precise
`FriendlyType<T>` / `MockData<T>` typing rejects a stale key or shape at
compile time.

Gap found while scoping: `packages/examples/src/` had NO tsconfig and NO
typecheck gate — nothing compiled it in CI (twoslash type-renders a few files
at site build; the rest were on the honor system). The drift alarm only works
if the examples actually compile in CI.

## Decisions (all DECIDED)

1. **New rule in CLAUDE.md → Website docs style:** prefer `<code-import>` from
   `packages/examples/src/` over hand-written fences for TypeScript examples;
   hand-written fences remain for CLI/bash, JSON config, output/tree listings,
   and deliberately partial fragments (transient reconcile states, orphan
   carcasses, plural-object excerpts) that are not compilable files.
2. **`packages/examples` gets a `tsconfig.json`** (strict, `noEmit`) with
   `paths` mapping `ts-runtypes`, `ts-runtypes/formats`, `ts-runtypes/schema`
   to the marker package's `src/` (the source lane, mirroring the
   `exports[".source"]` convention) and `runtypes-devtools/vite` to its built
   dist (consumers read dist — no source condition there, per repo policy).
3. **The root `typecheck` script gains the examples project** (`tsc -p
   packages/examples`), so `pnpm run lint` → `typecheck` → CI all gate on it.
   Pre-existing example files that fail their first-ever compile get fixed in
   the same pass.
4. **New example set under `packages/examples/src/enrich/`** backing the
   friendly-type, mock-data and i18n pages: the shared `User` type (TF
   formats), scaffold-state and filled friendly maps (scaffold state is
   type-legal — blanks are the opt-out), renderer usage, the `rt$default`
   mode, mock scaffold/filled/usage, the Polish translation
   (scaffold + filled), `createFriendlyI18n` usage, live locale switching
   (a plain `{value}` ref — no vue import), and the Currency renderer option.
5. **Const naming in the examples follows the generator** (`friendlyUser`,
   `mockUser`, `pl_friendlyUser`) — fixing the long-standing
   `userFriendly`/`userMock` doc drift as a side effect; page prose updated to
   match.
6. Tab titles keep showing the real project paths
   (`runtypes/generated/friendly/models/user.ts`) via the `lang="ts [title]"`
   attribute even though the imported file lives under `packages/examples/`.

## Acceptance

- Every full TypeScript example on the three enrichment pages is a
  `<code-import>` of a compiled file; remaining fences are bash/json/output
  or deliberately partial fragments.
- `tsc -p packages/examples` is green and wired into the root `typecheck`
  (hence `lint` and CI).
- Per-page MDC-component counts match the pre-edit baseline (fence counts
  drop by exactly the number of converted examples).
