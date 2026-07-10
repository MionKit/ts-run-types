# mion adoption — outcome

> **Status: DONE (shipped 2026-07-10).** Umbrella record for the mion-adoption
> work. It supersedes the two working trackers that used to live in
> `docs/todos/` (`mion-adoption-requirements.md`, `mion-migration-findings.md`),
> which were removed when this landed — the implementation + tests below are now
> the source of truth, and the descoped rationale lives in
> [`mion-adoption-descoped.md`](./mion-adoption-descoped.md).
>
> Principle applied throughout: **ts-runtypes ships the tools; mion owns its own
> integration.** Every gap was resolved as either a real ts-runtypes tool/bug
> (implemented) or a consumer-level concern (descoped, with rationale).

## Shipped

- **A1 — zero-config wrapper gating** (merged earlier in PR #212): the resolver's
  whole-program scan reports the site-file set; the plugin transforms exactly
  those files, so a consumer calling a wrapper from any package (node_modules
  included) works with no config. Detection is 100% in the Go compiler, so a
  bundler skipping node_modules in dev is irrelevant.

- **`InjectTypeFnArgs` — unbounded fn-key list + duplicate rejection**, and
  **Feature 2 — config-free markers in node_modules verified as the performant
  option.** Full write-up:
  [`inject-type-fn-args-unbounded-keys.md`](./inject-type-fn-args-unbounded-keys.md).

- **A5.1 — multi-slot injection.** A call signature may carry SEVERAL injection
  markers (`InjectTypeFnArgs` and/or `InjectRunTypeId`), each injecting at its
  own parameter index. mion's per-side `route(handler, opts?, paramsFns?,
  responseFns?)` shape now works, and a wrapper reads a type's runtype graph via
  a SEPARATE `InjectRunTypeId` param (so the `'rt'` key — A5.3 — was not needed;
  see descoped). Scanner (`resolver/scan.go`: `analyzeCall` collects every marker,
  branches single-trailing vs `analyzeMultiSlotInjection`), transform
  (`groupSitesByPos` composes one positional insertion per call, padding
  non-marker gaps with `undefined`; both wire modes share `buildGroupInsertion`).
  Single-marker calls stay byte-identical. Tests:
  `resolver/multislot_test.go`, `wrapper-multi-slot.test.ts`. Docs: ARCHITECTURE,
  `markers.ts`.

- **B1 — value-level JSON transforms.** Public `createPrepareForJson<T>()` /
  `createRestoreFromJson<T>()` over the existing `pj`/`rj` primitives (families /
  demand / `familyMeta` were already in place; only the public factories were
  missing). A framework that owns its JSON envelope transforms values without a
  string round-trip; root undefined/void handling lives in the primitives so
  neither throws; requestable as `'pj'`/`'rj'` keys in a marker. Tests:
  `prepareRestoreJson.test.ts`. Docs: serialization guide + a compilable example.

- **D1 — published `.d.ts` no longer forces the Temporal lib.** The Temporal
  instance types in `formats/datetime/temporalFormats.ts` are guarded behind
  `TemporalInstanceOf<K>` (a `typeof globalThis extends {Temporal: …}`
  conditional that falls back to `unknown`, never `any`, so the `& {brand}`
  intersection survives). The two no-ordering builders route through a NAMED
  `TemporalInstanceBuilderFn` interface so the emitter can't resolve the
  conditional back to `Temporal.*` at dist time. A root consumer with
  `skipLibCheck: false` + `lib: es2021` now compiles clean (was ~40 TS2503).
  Regression: `temporalDtsGuard.test.ts` (no bare `Temporal.` in any dist
  `.d.ts`).

- **D2 — CJS-scoped declarations + per-condition `exports.types`.** The CJS build
  now emits `dist/cjs/**/*.d.ts` (read as CommonJS via the `{ "type":
  "commonjs" }` marker), and each export splits `types` per condition (`import`
  → ESM d.ts, `require` → CJS d.ts). A CommonJS-format TS consumer under
  `moduleResolution: nodenext` no longer hits TS1479. Also removed three dead
  `./caches/*` export entries that pointed at non-existent files (pre-existing
  bug surfaced by the D2 regression test). Regression: `dualPackageTypes.test.ts`.

- **E1 — precompiled-library dedupe verified harmless.** Entry keys are
  content-addressed (`<fnHash>_<typeId>`), so a precompiled library and a
  consumer that both generate entries for the same type produce the same key +
  body; `addToRTCache` is an idempotent overwrite and `addPureFn` keeps the
  existing entry on a matching bodyHash. No double-registration. Pinned by
  `precompiledLibraryDedupe.test.ts`. The `--compile` library-publish recipe
  itself stays mion's build concern (see descoped).

## Descoped (consumer-level)

A2 (remaining fixtures), A3, A4, **A5.3** (`'rt'` key — mion adds a separate
`InjectRunTypeId` param, which now injects via A5.1), B2, B3, C1, C2, E2. Each
is explained in [`mion-adoption-descoped.md`](./mion-adoption-descoped.md).

## Deferred

E3 (a `Bun.plugin` loader) — a genuine future ts-runtypes package, not mion's to
hand-roll; `--compile` is the documented bun path meanwhile. Tracked in
[`docs/ROADMAP.md`](../ROADMAP.md).
