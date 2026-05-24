# Mion → ts-go-run-types port audit — overview & index

> **Date:** 2026-05-29
> **What this is:** a function-family-by-function-family comparison of the original
> mion runtime-type engine (`@mionjs/run-types` + `@mionjs/type-formats`) against
> its re-implementation in `ts-go-run-types`. For each family we record what mion
> does, what we emit, where we deliberately diverge, and any holes / mismatches /
> missed optimisations / skipped tests.
> **Method:** static source comparison. The Go binary + Vitest suites are built and
> run where the environment allows; otherwise test counts are obtained by counting
> `it()` / `test()` registrations and are marked accordingly.

## Why the architectures differ

| | mion | ts-go-run-types |
|---|---|---|
| Where reflection comes from | deepkit type compiler (runtime `Type` objects) | tsgo checker, projected ahead-of-time into a JSON/`.ts` cache |
| When RT functions compile | lazily, at first call (JIT, `new Function`) | ahead-of-time, in Go, spliced into a precompiled cache module |
| Emit organisation | **two modes**: (a) class-based — each `RunType` node owns `_compile<Fn>` methods; (b) switch-based JIT compilers (`jitCompilers/binary`, `jitCompilers/json/stringifyJson`) | **one mode**: a single Go `switch rt.Kind` per fn family in `internal/compiled/typefns/<fn>.go` |
| Type formats | separate package `@mionjs/type-formats` | folded into `@mionjs/ts-go-run-types/formats` + `internal/compiled/typefns/formats/` |

The unification to "one giant switch per fn family" is deliberate: mion's dual model
(per-node methods *and* per-compiler switches) was two mental models for the same job.

## Source-tree map

**mion** (`/home/user/mion/packages/`)
- `run-types/src/nodes/<atomic|collection|member|function|native>/<kind>.ts` — per-node emit methods
- `run-types/src/jitCompilers/binary/{toBinary,fromBinary}.ts`, `json/stringifyJson.ts` — switch compilers
- `run-types/src/lib/{jitFnCompiler,baseRunTypes,typeId,...}.ts` — compiler infra
- `run-types/src/**/*.spec.ts` and `jitCompilers/**/<NN><Family>.spec.ts` — tests
- `type-formats/src/{string,number,bigint}/*.runtype.ts` (+ `.spec.ts`) — formats

**ts-go-run-types** (`/home/user/ts-run-types/`)
- Go emitters: `internal/compiled/typefns/<fn>.go` (one switch per family)
- Reflection-shape AST projection: `internal/compiled/runtype/{serialize,module,union_safeorder}.go`, `internal/compiled/runtype/typeid/`
- Pure-fn graph: `internal/compiled/purefns/`
- JS factories: `packages/ts-go-run-types/src/createRTFunctions.ts`, `createBinary.ts`, `mocking/createMockType.ts`
- Cache modules/skeletons: `packages/ts-go-run-types/src/caches/*Cache.ts`
- Formats: `packages/ts-go-run-types/src/formats/`, `internal/compiled/typefns/formats/`
- Tests: `packages/ts-go-run-types/test/{suites,adapters}/`

### Cache-tag ↔ family map

| tag | family | Go emitter | mion source |
|---|---|---|---|
| `runType` | reflection AST cache | `internal/compiled/runtype/module.go` | deepkit `Type` (new concept) |
| `it` | isType | `istype.go` | `nodes/**` `_compileIsType` |
| `te` | typeErrors | `typeerrors.go` | `nodes/**` `_compileTypeErrors` |
| `huk`/`suk`/`uke`/`uku`/`ukuw` | unknown-keys family | `unknownkeys_*.go` | `nodes/**` `_compile<UnknownKeys*>` |
| `pj` | prepareForJson (mutate) | `json_prepare.go` | `nodes/**` `_compileJsonEncode` |
| `pjs`/`pjsp` | prepareForJsonSafe / …Preserve (clone) | `json_prepare_safe*.go` | (new — clone strategy) |
| `rj` | restoreFromJson | `json_restore.go` | `nodes/**` `_compileJsonDecode` |
| `sj` | stringifyJson (direct) | `json_stringify.go` | `jitCompilers/json/stringifyJson.ts` |
| `tb`/`fb` | toBinary / fromBinary | `binary_to.go` / `binary_from.go` | `jitCompilers/binary/{toBinary,fromBinary}.ts` |
| `fmt` | formatTransform | `formattransform.go` | `type-formats` value transform |

### Public JSON / binary API (single emitter + options)

- `createJsonEncoder<T>(val?, {strategy:'clone'|'direct'|'mutate', stripExtras?}, id?)`
  → `direct`=`sj`; `clone`+strip=`pjs`; `clone`+keep=`pjsp`; `mutate`+keep=`pj`; `mutate`+strip=`uku`∘`pj`.
- `createJsonDecoder<T>(val?, {stripExtras?}, id?)` → keep=`rj`; strip=`ukuw`∘`rj`.
- `createBinaryEncoder` / `createBinaryDecoder` (+ `createDataViewSerializer`/`Deserializer` for buffer reuse).

## Standard per-item document template

Every `NN-*.md` in this folder uses **exactly** these seven sections:

```
# NN — <Family>: mion vs ts-go-run-types port audit
> Date · Method (static / executed)

## 1. Verdict
✅ fully ported / ⚠️ ported with gaps / ❌ major gap — plus 2–4 sentence summary.

## 2. Scope & sources
mion files · Go emitter file(s) · JS factory + cache · cache tag(s) · public API.

## 3. Per-kind / per-feature comparison
| Kind / feature | mion behaviour | ts-go-run-types behaviour | Match? | Notes |
(Match? = ✅ / ⚠️ by-design divergence / ❌ gap)

## 4. Intentional deviations (by design)

## 5. Gaps, mismatches & missed optimisations
Numbered; each: severity (High/Med/Low) · evidence (file:line) · impact · suggested fix.
"None found." if clean.

## 6. Test-coverage comparison
mion specs (files, ~N cases) · ts-go adapters/suites (files, ~N cases) ·
mion cases with no ts-go counterpart · skipped/TODO tests.

## 7. Recommended follow-ups
Prioritised. "None." if clean.
```

## Index

| # | Family | Doc |
|---|---|---|
| 01 | runTypes emission (reflection AST cache) | [01-runtypes-emission.md](01-runtypes-emission.md) |
| 02 | isType | [02-istype.md](02-istype.md) |
| 03 | getTypeErrors | [03-gettypeerrors.md](03-gettypeerrors.md) |
| 04 | unknown-keys family | [04-unknown-keys.md](04-unknown-keys.md) |
| 05 | JSON serialization | [05-json-serialization.md](05-json-serialization.md) |
| 06 | binary serialization | [06-binary-serialization.md](06-binary-serialization.md) |
| 07 | string type-format | [07-string-format.md](07-string-format.md) |
| 08 | number type-format | [08-number-format.md](08-number-format.md) |
| 09 | bigint type-format | [09-bigint-format.md](09-bigint-format.md) |
| 10 | forgotten-functionality sweep | [10-forgotten-functionality.md](10-forgotten-functionality.md) |

Cross-cutting findings and the consolidated follow-up backlog are summarised at the
bottom of [10-forgotten-functionality.md](10-forgotten-functionality.md).
