# Audit progress & architecture anchor (scratch)

> Working memory for the "mion run-types/type-formats vs ts-go-run-types" port-audit
> task. Survives context compaction. Date: 2026-05-29.

## Goal

Compare full **mion** (`@mionjs/run-types` + `@mionjs/type-formats`) functionality
against the ported **ts-go-run-types**, find holes / errors / mismatches / missed
optimisations / skipped tests / forgotten features. Produce one analysis doc per
list item (identical format) under `docs/audit/`. First, de-stale existing docs.

## Architecture map (mion → ts-go-run-types)

**mion** (`/home/user/mion/packages/run-types/src/`): class-based — each
reflection-kind node (`nodes/<cat>/<kind>.ts`) carries per-fn emit methods
(`_compileIsType`, `_compileTypeErrors`, `_compileJsonEncode`/Decode, unknownKeys,
binary…) on a RunType class; PLUS switch-based JIT compilers in
`jitCompilers/{binary/toBinary.ts,fromBinary.ts , json/stringifyJson.ts}`.
Type-formats live in separate pkg `/home/user/mion/packages/type-formats/src/`
(`string/`, `number/`, `bigint/`).

**ts-go-run-types** (`/home/user/ts-run-types/`): unified **purely switch-based**.
- Go AOT emitters: `internal/compiled/typefns/<fn>.go` — one giant switch per fn family.
- Reflection-shape projection (the runTypes AST cache): `internal/compiled/runtype/`
  (`serialize.go`, `module.go` = JSON + self-wired TS renderer, `typeid/`, `union_safeorder.go`).
- Pure-fn graph: `internal/compiled/purefns/`.
- JS adapters: `packages/ts-go-run-types/src/createRTFunctions.ts` (validators, unknownKeys,
  JSON encoder/decoder, formatTransform), `createBinary.ts` (binary), `mocking/createMockType.ts`.
- Caches (skeletons + runtime modules): `packages/ts-go-run-types/src/caches/*Cache.ts`.
- Formats folded in: `packages/ts-go-run-types/src/formats/{string,numberFormats,bigintFormats}`
  + Go `internal/compiled/typefns/formats/{string,numeric}`. (NO separate `@mionjs/ts-go-type-formats` pkg anymore.)
- Tests: `packages/ts-go-run-types/test/{suites,adapters}/`.

### Cache tags (fn id namespaces)
it(isType) · te(typeErrors) · huk/suk/uke/uku/ukuw(unknownKeys family) ·
pj(prepareForJson/mutate) · pjs(prepareForJsonSafe/clone+strip) ·
pjsp(prepareForJsonSafePreserve/clone+keep) · rj(restoreFromJson) ·
sj(stringifyJson/direct) · tb/fb(binary) · fmt(formatTransform).

### Public JSON API (single emitter w/ options — confirmed)
`createJsonEncoder<T>(val?, {strategy:'clone'|'direct'|'mutate', stripExtras?}, id?)`
→ direct=`sj`; clone+strip=`pjs`; clone+keep=`pjsp`; mutate+keep=`pj`; mutate+strip=`uku`+`pj`.
`createJsonDecoder<T>(val?, {stripExtras?}, id?)` → keep=`rj`; strip=`ukuw`+`rj`.

### Full public API (index.ts)
markers(getRunTypeId/reflectRunTypeId/InjectRunTypeId/CompTimeArgs/PureFunction);
getRTUtils/getRTFnCaches; registerPureFnFactory; TypeFormat types; registerFormatPattern;
registerMockingFunction; RunTypeKind; createIsType/createGetTypeErrors;
createHasUnknownKeys/createStripUnknownKeys/createUnknownKeyErrors/createUnknownKeysToUndefined;
createFormatTransform; createJsonEncoder/createJsonDecoder; createBinaryEncoder/createBinaryDecoder;
createMockType; createDataViewSerializer/Deserializer/setSerializationOptions.

## Environment
- Tools present: go `/usr/local/go/bin/go`, node 22, pnpm 11. Network OK.
- Bootstrap (submodule+patches+install+build) launched in background → `/tmp/bootstrap.log`.
  Until it finishes, audit is STATIC (read code + count `it()/test()`); note this in docs.

## Doc staleness catalog (Phase 0)
Path/name fixes needed across docs/*.md, README.md, CLAUDE.md, .claude/skills/*:
- `internal/emit/*` → `internal/compiled/runtype/module.go` (json + TS render)
- `internal/serialize/*` → `internal/compiled/runtype/serialize.go` (+ union_safeorder.go)
- `internal/walker` → `internal/resolver/walk.go` + `scan.go`
- `internal/typeid` → `internal/compiled/runtype/typeid`
- `packages/runtypes` → `packages/ts-go-run-types`
- `diagnosticMessages.ts` → `diagnosticCatalog.ts`
- `createIsType.ts`/`createGetTypeErrors.ts` (skill refs) → `createRTFunctions.ts`
- `DEVS.md` → `CONTRIBUTORS.md`
- `internal/cachetpl/skeletons/` → skeleton `.ts` live in `packages/ts-go-run-types/src/caches/`; Go const in `internal/cachetpl/splice.go`
Content fixes: ROADMAP (formats pkg folded; number/bigint formats DONE; binary status);
ARCHITECTURE ("out of scope v0.2" list — templateLiteral & formats done; package layout);
port-status (JSON API rename to createJsonEncoder/Decoder; test counts; add binary+formats+safe families);
skills (createRTFunctions consolidation; rt-suite/validation-suite naming).
NOTE: `cmd/gen-ts-constants` + `internal/diag/codes_runtype.go` references are CORRECT (not stale).

## List items → docs (status)
- [x] Phase 0 docs de-staled (committed: stale tokens clean, ROADMAP/ARCH/port-status updated)
- [x] 01 runTypes emission → docs/audit/01-runtypes-emission.md ⚠️ ported-with-(by-design)-gaps.
      VERIFIED: Inlined/IsCircular/Description/Brand declared but NEVER assigned (grep empty);
      intersection collapsed (serialize.go:607); kind numbering parity 0-35. Follow-ups: add JS
      reflection-shape suite; populate IsCircular→inline-unless-circular; Inlined; Description(JSDoc).
- [ ] 02 isType                                    → docs/audit/02-istype.md
- [ ] 03 getTypeErrors                             → docs/audit/03-gettypeerrors.md
- [ ] 04 unknown-keys family (huk/suk/uke/uku/ukuw)→ docs/audit/04-unknown-keys.md
- [ ] 05 JSON serialization (pj/pjs/pjsp/sj/rj)    → docs/audit/05-json-serialization.md
- [ ] 06 binary serialization (tb/fb)              → docs/audit/06-binary-serialization.md
- [ ] 07 string type-format                        → docs/audit/07-string-format.md
- [ ] 08 number type-format                        → docs/audit/08-number-format.md
- [ ] 09 bigint type-format                         → docs/audit/09-bigint-format.md
- [ ] 10 forgotten functionality sweep            → docs/audit/10-forgotten-functionality.md

## Reference: mion emit vocabulary + test inventory + env results

**mion node emit methods** (class `XxxRunType extends AtomicRunType/...`, return `{code, type:'E'|'S'}`,
args `comp.vλl`, `comp.callJitErr(this)`):
emitIsType(38) · emitTypeErrors(34)+emitIsTypeErrors(3) · emitPrepareForJson(29) · emitRestoreFromJson(32) ·
emitJsonStringify(1, rest in `jitCompilers/json/stringifyJson.ts`) · emitHasUnknownKeys/emitStripUnknownKeys/
emitUnknownKeyErrors/emitUnknownKeysToUndefined(12 each) · emitToBinary(2)/emitFromBinary(2) (rest in
`jitCompilers/binary/{toBinary,fromBinary}.ts`) · mock(244). Compiler classes: JitFnCompiler / JitErrorsFnCompiler /
MockJitCompiler / BaseFnCompiler (`lib/jitFnCompiler.ts`).

**mion test inventory (it()/test() counts, counted statically):**
run-types nodes — atomic 48 · collection 171 · member 53 · function 18 · native 103 · utility 66; lib 48.
jitCompilers — jsonSpec 136 · stringifySpec 133 · binarySpec 148.
type-formats — string 174 · number 74 · bigint 41.

**Env / test results:** toolchain present (go 1.26 at /usr/local/go/bin, node 22 [wanted ≥24, soft warn], pnpm 11).
Bootstrap OK (submodules+patches+install+`GO BUILD OK`). `go test ./internal/...` → ALL PASS, 0 skipped.
JS suite: must `pnpm --filter vite-plugin-runtypes run build` first (its dist is consumed by marker vitest config),
then `pnpm exec vitest run`. RESULT: **41 files, 1284 passed, 71 todo, 0 failed** (/tmp/jstest.log).
**Skips/todos (tests left behind) concentrate in FORMATS**: `formatGetTypeErrors.test.ts` ~29-31 it.todo
(FormatString minLength/maxLength/allowed/disallowedChars/Values, FormatAlpha/Numeric/AlphaNumeric, FormatUUIDv7,
FormatStringDate/Time layouts…), `formatMockType.test.ts` ~42-44 it.todo. validation-suite has a todo-only section
(~line 6956 "every case is it.todo") + ref (~9507) to mion `utility/string.spec.ts` being `.skip()`'d. → flag in items 03/07/08/09.

## Standard doc template (ALL item docs identical)
See `docs/audit/00-overview.md` for the canonical template; every NN-*.md mirrors:
1 Verdict · 2 Scope & sources · 3 Per-kind/feature comparison table ·
4 Intentional deviations · 5 Gaps/mismatches/missed-optimisations (severity+evidence+fix) ·
6 Test-coverage comparison · 7 Recommended follow-ups.
