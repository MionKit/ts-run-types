# 07 — string type-format: mion vs ts-go-run-types port audit

> Date: 2026-05-29 · Method: static source comparison (Go binary + Vitest suites NOT executed here; test registrations counted, marked "counted, not executed"). Central run reported: `formatGetTypeErrors.test.ts` had ~29 skipped/`it.todo`; `formatMockType.test.ts` had ~42 skipped/`it.todo`.

## 1. Verdict

⚠️ **Ported with gaps.** Every mion string format — `StringRunTypeFormat` (FormatString + Alpha/AlphaNumeric/Numeric/Lowercase/Uppercase/Capitalize), UUID, Date, Time, DateTime, Domain, Email, IP, URL — has a registered Go emitter under `internal/compiled/typefns/formats/string/*.go`, and the **isType** validation logic is a faithful, near-line-for-line port: the regex sources are copied verbatim (string-patterns.ts), the date/time/uuid/ip pure fns are reused unchanged (string-formats-pure-fns.ts mirrors type-formats-pure-fns.ts), the decomposition walkers (domain split-on-`.`, email split-on-last-`@`, dateTime split-on-`splitChar`) match mion's hand-written loops, and the param surface (minLength/maxLength/length, allowed/disallowed chars+values, ignoreCase, custom errorMessage, regexp-special escaping) is honoured in both emit and build-time validation (FMT002). The brand scanner (`typeid/formats.go`) correctly lifts `TypeFormat<Base,Name,Params,Brand>` into a `FormatAnnotation` and folds params into the structural id with canonical key-order-independent hashing, ignoring only `mockSamples`/`message`. **The headline gap is test coverage, not shipped code:** format **validation-ERROR** and **MOCK** surfaces are largely stubbed — `formatGetTypeErrors.test.ts` has **29 `it.todo`** (every one in STRING_FORMAT; only 15 of 44 string cases carry a `getTypeErrors` thunk) and `formatMockType.test.ts` has **42 `it.todo`** (31 STRING + 6 NUMBER + 5 BIGINT; only 13 of 44 string cases carry a `mockType` thunk). isType / transform / serialization / binary round-trip are fully wired (0 todo each). Beyond tests, the deviations are by-design (validate-only `format` transform applied by a separate RT-fn; FMT002 replacing mion's runtime `validateParams` throw) plus three minor behavioural notes (§5).

## 2. Scope & sources

- **mion (ORIGINAL):** `/home/user/mion/packages/type-formats/src/string/` — one RunType subclass per format, each a `BaseRunTypeFormat<P>` with `emitIsType`/`emitIsTypeErrors`/`emitFormat`/`_mock`/`validateParams`:
  - `stringFormat.runtype.ts:32-238` (`StringRunTypeFormat`, id `'stringFormat'`) + the regexp builders `getAllowedCharsRegexp`/`getDisallowedCharsRegexp`/`getAllowed/DisallowedValuesRegexp` (lines 271-289) and `getDefaultMessage` table (15-21).
  - `uuid.runtype.ts:17-44`, `date.runtype.ts:23-85`, `time.runtype.ts:26-93`, `dateTime.runtype.ts:19-100`, `domain.runtype.ts:44-276`, `email.runtype.ts:25-188`, `ip.runtype.ts:17-47`, `url.runtype.ts:30-162`, `defaultStringFormats.runtype.ts:13-46` (Alpha/AlphaNumeric/Numeric regexes + Lowercase/Uppercase/Capitalize transformer aliases).
  - Pure fns: `type-formats-pure-fns.ts:28-405` (`cpf_isDateString*`, `cpf_isTimeString*`/`cpf_isHours`/`cpf_isMinutes`/`cpf_isSeconds`/`cpf_isSecondsWithMs`/`cpf_isTimeZone`, `cpf_isUUID`, `cpf_isLocalHost`/`cpf_isIPV4`/`cpf_isIPV6`/`cpf_mionGetIPErrors`). `regexpEscape` in `utils.ts`.
  - Base format infra `@mionjs/run-types` `BaseRunTypeFormat` (`emitIsTypeErrors` is a FORMAT concept, dispatched from `compileFormat`).
- **Go emitter:** `internal/compiled/typefns/formats/string/` — `stringformat.go` (StringFormat + shared length/char/value condition + error builders + `ValidateParams`), `uuid.go`, `date.go`, `time.go`, `datetime.go`, `domain.go`, `email.go`, `ip.go`, `url.go`, `pattern.go` (pattern recovery + `emitPatternTest` regex hoist + `validateSamples` RE2 oracle + `re2Pattern`), `shared.go` (`pureFnAlias`, `formatErrCall`, `regexpEscape`, `messageLiteral`, `jsParamsLiteral`). Registry `formats/registry.go` (`Emitter`/`ParamValidator`/`FormatTransformer`/`BinaryEncoder`/`BinaryDecoder` interfaces + `Register`/`Lookup`/`LookupForRunType`). Blank-import wiring `formats/all/all.go`.
- **Host splice:** `istype.go:177-192` (`base.Type==CodeE && rt.FormatAnnotation!=nil` → `(base && (check))`, AND emits FMT002 via `ValidateParams`), `typeerrors.go:165-177` (`base.Type==CodeS` → `base;if (<baseKindGuard>) {check}`, guard `baseKindGuard` at 186-196), `formattransform.go` (applies `EmitFormatTransform`).
- **Brand scanner / param folding:** `internal/compiled/runtype/typeid/formats.go` — `FormatAnnotationFromType` (sentinels `__rtFormatName`/`__rtFormatParams`), `formatPatternFromSymbol`/`formatPatternFromCall`/`traceRegexpExpr` (recover `registerFormatPattern({regexp|source,flags, mockSamples, message})`), `FormatAnnotationStructuralKey`/`canonicalLiteralMap` (idempotent hash; `structuralKeyIgnoredParams = {mockSamples, message}`).
- **JS factories / runtypes:** `src/runtypes/typeFormat.ts` (`TypeFormat<Base,Name,Params,BrandName>` two-prop brand), `formatAnnotation.ts`, `formatPattern.ts` (`registerFormatPattern` — validates samples with the real JS engine at module load). Type aliases `src/formats/string/stringFormats.ts`; patterns `string-patterns.ts`; pure fns `string-formats-pure-fns.ts`. Mock `src/mocking/mockStringFormat.ts` (one fn `registerMockingFunction(RunTypeKind.string, mockStringFormat)`, dispatch by `annotation.name`).
- **Public API:** the `createIsType<T>` / `createGetTypeErrors<T>` / `createMockType<T>` / `createFormatTransform<T>` families gain format behaviour automatically when `T` is a `TypeFormat<…>` (the splice in §2 above). No format-specific public entry point — `import '@mionjs/ts-go-run-types/formats'` registers the mock fn + patterns + pure fns.

## 3. Per-kind / per-feature comparison

`Match?`: ✅ correct · ⚠️ by-design divergence · ❌ gap. Code cited file:line.

### 3a. Per-format validation parity (isType predicate / pure-fn dispatch)

| Format | mion validation | ts-go-run-types | Match? | Notes |
|---|---|---|---|---|
| **StringFormat** (base) | AND of length + pattern/char/value tests, mion order maxLength,minLength,length,pattern,allowedChars,disallowedChars,allowedValues,disallowedValues (stringFormat.runtype.ts:53-79) | `stringConditions` same order (stringformat.go:68-90); `lengthConditions` 95-107 | ✅ | identical operator forms (`<=`,`>=`,`===`) |
| **UUID v4/v7** | `cpf_isUUID(v, {version})` — 36-char loop, nibble 14 = version (uuid.runtype.ts:24; pure-fns:267-285) | `cpf_isUUID(v,{version:'<v>'})` via `pureFnAlias` (uuid.go:39-52) | ✅ | same pure fn reused |
| **Date** ISO/YYYY-MM-DD/DD-MM-YYYY/MM-DD-YYYY/YYYY-MM/MM-DD/DD-MM | `getFormatPureFn` → 6 `cpf_isDateString_*` (date.runtype.ts:66-84) | `dateFormatPureFn` → same 6 (date.go:28-44) | ✅ | leap-year logic in shared `isDateString` pure fn |
| **Time** ISO/[.mmm]TZ/[.mmm]/HH:mm:ss/HH:mm/mm:ss/HH/mm/ss | `getFormatPureFn` → 8 fns incl. bare HH/mm/ss (time.runtype.ts:70-91) | `timeFormatPureFn` → same 8 (time.go:26-46) | ✅ | all 8 layouts present |
| **DateTime** | split on `splitChar` (default 'T'), validate date half + time half (dateTime.runtype.ts:34-61) | IIFE `((dtp)=>dtp!==-1 && dateFn(sub) && timeFn(sub))(indexOf(split))` (datetime.go:85-102) | ✅ | reuses date/time pure fns; nested `format` defaults to ISO (datetime.go:42-43) |
| **Domain** pattern path (standard/unicode/punycode) | single baked regex + length (domain.runtype.ts:80) | `namedPatternIsType` (domain.go:37; pattern.go:68-78) | ✅ | regexes verbatim (below) |
| **Domain strict** (names/tld decomposition) | split on `.`, per-label sub-format, hyphen-edge reject, maxParts/minParts (domain.runtype.ts:101-116) | `domainIsTypeExprFor` IIFE — same loop, `count=1`, hyphen check skipped when names is allowedValues (domain.go:109-146) | ✅ | label/tld validated via `stringConditions` over `name`/`tld` vars |
| **Email** pattern path (standard/punycode) | single baked regex + length (email.runtype.ts:59) | `namedPatternIsType` (email.go:33) | ✅ | |
| **Email strict** (localPart+domain) | split on **last** `@`, validate localPart sub-format + domain (which may itself decompose) (email.runtype.ts:78-88) | `emailIsTypeExprFor` IIFE — `lastIndexOf('@')`, `domainSubCheckExpr` recurses into domain decomposition (email.go:58-83) | ✅ | last-`@` semantics preserved |
| **IP v4/v6/any** | `cpf_isIPV4`/`cpf_isIPV6`, 'any' → OR; whole params passed for allowLocalHost/allowPort (ip.runtype.ts:21-29) | `ipCheckExpr` → same dispatch + `jsParamsLiteral(params)` arg (ip.go:47-59) | ✅ | localhost / port / section-count logic in reused pure fns (pure-fns:300-364) |
| **IP +Port (v4/v6)** | `allowPort` honoured inside `cpf_isIPV4`/`cpf_isIPV6` (`[addr]:port` for v6) (pure-fns:302-342) | params object carries `allowPort:true` → same pure fns (ip.go:47) | ✅ | no port-specific Go branch needed |
| **IP localhost** | `cpf_isLocalHost` + `allowLocalHost` gate (pure-fns:290-297) | reused via params (ip.go) | ✅ | |
| **URL** standard/http/file | single baked regex + length (url.runtype.ts:59) | `namedPatternIsType` (url.go:20) | ⚠️ | port covers the **pattern** path only — mion's URL `domain`/`ip` sub-validation (url.runtype.ts:60-87) is NOT ported (§5 #3). `FormatParams_Url` in the port has only `pattern`/`mockSamples` (stringFormats.ts:302-305) |
| **Alpha** | `/^[\p{L}]+$/u` via DEFAULT_ALPHA_PARAMS pattern (defaultStringFormats.runtype.ts:14,24) | `ALPHA_PATTERN` `/^[\p{L}]+$/u` (string-patterns.ts:69) | ✅ | byte-identical source+flags |
| **AlphaNumeric** | `/^[\p{L}\p{N}]+$/u` (line 13) | `ALPHANUMERIC_PATTERN` (string-patterns.ts:73) | ✅ | |
| **Numeric** | `/^[\p{N}]+$/u` (line 15) | `NUMERIC_PATTERN` (string-patterns.ts:77) | ✅ | |
| **Lowercase / Uppercase / Capitalize** | transformer-only — `lowercase:true`/`uppercase:true`/`capitalize:true` flags, NO validation predicate; validate as plain string (defaultStringFormats.runtype.ts:43-45) | same — flags live in `StringParams` transformer block; `stringConditions` ignores them; transform applied by `EmitFormatTransform` (stringformat.go:263-285) | ✅ | confirms task focus #5 — transformer-only |

**Regex source parity** (the built-in domain/email/url patterns, mion → port, byte-compared):
- Domain `/^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/` — mion domain.runtype.ts:25 ≡ port string-patterns.ts:18. ✅
- Domain unicode `…[\p{L}\p{N}]…/u` mion:27 ≡ port:24. ✅ · Punycode `…[a-zA-Z0-9-]{2,63}$/` mion:29 ≡ port:30. ✅
- Strict label `/^[a-zA-Z0-9-]+$/` mion:30 ≡ port:36; tld `/^[a-zA-Z]+(\.[a-zA-Z]+)?$/` mion:31 ≡ port:40. ✅
- Email `/^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/` mion:20 ≡ port:46; punycode mion:21 ≡ port:50. ✅
- URL `/^(?:https?|ftps?|wss?):\/\/[^\s/$.?#-][^\s]*$/i` mion:24 ≡ port:56; http mion:26 ≡ port:59; file mion:25 ≡ port:63. ✅

### 3b. Params (task focus #2)

| Param | mion emit / validate | ts-go-run-types emit / validate (FMT002) | Match? |
|---|---|---|---|
| minLength/maxLength/length | `<=`/`>=`/`===` in isType (stringFormat.runtype.ts:58-60); errors `if (len > max)` etc. (86-101) | `lengthConditions` / `lengthErrorStatements` identical (stringformat.go:95-107, 184-199) | ✅ |
| length ⊻ (max\|min) mutual exclusion | throw (line 176) | FMT002 (stringformat.go:308-310) | ✅ |
| maxLength ≥ minLength | throw (178) | FMT002 (stringformat.go:311-313) | ✅ |
| allowedChars `^[esc]+$` / ignoreCase | `getAllowedCharsRegexp` flags `i` (271-274); isType asserts (62-65) | `allowedCharsSource` + `readCharParam` flags `i` (stringformat.go:159-161, 113-126) | ✅ |
| disallowedChars `[esc]` negated / ignoreCase | `getDisallowedCharsRegexp` (276-279); `!re.test` (66-69) | `disallowedCharsSource` + `"!"+test` (stringformat.go:166-168, 80-82) | ✅ |
| allowedValues `^(?:a\|b)$` / ignoreCase | `getAllowedValuesRegexp` (281-284); asserts (70-73) | `valuesSource` + `readValuesParam` (stringformat.go:173-179, 132-154) | ✅ |
| disallowedValues `^(?:a\|b)$` negated | `getDisallowedValuesRegexp` (286-289); `!re.test` (74-77) | `valuesSource` + `"!"+test` (stringformat.go:86-88) | ✅ |
| allowed/disallowedValues ≤100 | throw (181-184) | FMT002 (stringformat.go:314-319) | ✅ |
| only-one-complex-param | throw (194-198) | FMT002 (stringformat.go:320-328) | ✅ |
| disallowed* require mockSamples | throw (203-205) | FMT002 (stringformat.go:329-334) | ✅ |
| custom errorMessage → error `val` | `getDefaultMessage` returns `p[name].errorMessage \|\| default` (267-268); pushed as format `val` | `messageLiteral` same, with a documented exception: `pattern`'s message lives under key-excluded `message`, so emits only the static default to preserve cache identity (shared.go:84-101) | ⚠️ by-design — non-pattern custom messages surface; a custom **pattern** message does not (cache-correctness trade-off) |
| regexp-special-char literal escaping | `regexpEscape` `/[/\-\\^$*+?.()\|[\]{}]/g` (utils.ts) | `regexpEscape` same exact set, NOT `regexp.QuoteMeta` (shared.go:53-70) | ✅ |
| pattern requires mockSamples (build) | throw (203-205, `propsWithRequiredSamples`) | RE2 sample-match oracle FMT001 (`validateSamples`, pattern.go:115-128); JS `registerFormatPattern` throws at module load on sample mismatch (formatPattern.ts:73-80) | ⚠️ split: mion throws at RT-compile; port validates samples at JS module-load (real engine) + best-effort RE2 at build. Stronger in practice |

### 3c. Brand scanner + idempotent param hashing (task focus #3)

| Feature | mion | ts-go-run-types | Match? |
|---|---|---|---|
| `TypeFormat<Base,Name,Params,Brand>` → annotation | deepkit TypeAnnotation tag | two sentinel props `__rtFormatName`/`__rtFormatParams` lifted by `FormatAnnotationFromType` (formats.go:31-59) | ✅ by-design |
| `registerFormatPattern` recovery (regexp / {source,flags}) | `resolveFormatParams` from call args | `formatPatternFromCall` traces `regexp` literal (incl. const-alias chains, import aliases) + `{source,flags}` overload (formats.go:176-228, 272-308) | ✅ |
| params folded into structural id | `typeId` includes resolved params | `FormatAnnotationStructuralKey` appended to parent id (formats.go:379-391) | ✅ |
| same params → same hash (order-independent) | sorted | `canonicalLiteralMap` sorts keys at **every** nesting depth (formats.go:409-433) | ✅ |
| samples/message excluded from id | `defaultIgnoreFormatProps` | `structuralKeyIgnoredParams = {mockSamples, message}` (formats.go:400-403) | ✅ — two formats differing only in samples/message dedup to one entry |
| numeric int-vs-float canonicalisation | — | `json.Marshal` (`1`≡`1.0`) (formats.go:446-453) | ✅ |

### 3d. Mock generation (task focus #4)

| Format | mion `_mock` | ts-go-run-types `mockStringFormat` | Match? |
|---|---|---|---|
| dispatch | per-class `_mock`/`mock` | single fn keyed by `annotation.name`, `registerMockingFunction(KindString,…)` (mockStringFormat.ts:28-54) | ✅ by-design (class→switch) |
| StringFormat | allowedValues → randomItem; samples (pattern/disallowed*) → randomItem/charset; else length-bounded random (stringFormat.runtype.ts:128-166) | `mockStringParams` same precedence: allowedValues → pattern.mockSamples / disallowedValues samples → allowedChars/disallowedChars charset → random; throws if pattern w/o samples (mockStringFormat.ts:58-72) | ✅ |
| UUID | v4 `crypto.randomUUID()`, v7 `randomUUID_V7()` (uuid.runtype.ts:34-37) | `randomUUIDv4`/`randomUUIDv7` (crypto fallback) (mockStringFormat.ts:120-146) | ✅ |
| Date / Time / DateTime | leap-year-aware date, tz/ms time, combine with splitChar (date/time/dateTime.runtype.ts) | `mockDateLayout`/`mockTimeLayout`/`mockDateTime` same layouts + `maxDaysInMonth` (mockStringFormat.ts:150-221) | ✅ |
| IP | v4 dotted-quad / v6 hex, localhost gate (ip.runtype.ts:51-60) | `mockIp*` identical (mockStringFormat.ts:225-239) | ✅ |
| Domain / Email | sample-driven; strict path builds name.tld / local@domain (domain.runtype.ts:162-228, email.runtype.ts:120-147) | `mockDomain`/`mockEmail` — simplified: pick name/tld sample else `example`/`com`, local else `user` (mockStringFormat.ts:243-259) | ⚠️ port is a simpler sampler (no length-aware multi-subdomain growth) — adequate for "mock value passes isType", but less varied than mion |
| URL | url sampler + protocol + domain/ip replace (url.runtype.ts:116-127) | pick `mockSamples` else `https://example.com` (mockStringFormat.ts:48) | ⚠️ simpler; no domain/ip substitution (consistent with URL sub-validation not ported, §5 #3) |

### 3e. Transform / default formats (task focus #5)

| Feature | mion | ts-go-run-types | Match? |
|---|---|---|---|
| `emitFormat` transform chain | trim/replace/replaceAll/lowercase/uppercase/capitalize (stringFormat.runtype.ts:40-52) | `EmitFormatTransform`: trim/lowercase/uppercase/capitalize (stringformat.go:263-285) | ⚠️ **`replace`/`replaceAll` NOT plumbed** (documented follow-up, stringformat.go:261-262) §5 #4 |
| domain/email/ip/url lowercase transform | `emitFormat` returns `v.toLowerCase()` (domain:229, email:148, ip:44, url:141) | `EmitFormatTransform` returns `v.toLowerCase()` (domain.go:49-51, ip.go:84-86, url.go:29-31) | ⚠️ email has **no** `EmitFormatTransform` in port (email.go) — mion lowercases email (email.runtype.ts:148). §5 #5 |
| Lowercase/Uppercase/Capitalize validate as plain string | yes (no predicate) | yes — flags ignored by `stringConditions` (stringformat.go:68-90) | ✅ |
| transform applied AFTER mock | mion `_formatMockedValue` | mock walker applies transform after `mockStringFormat` (mockStringFormat.ts:5-6 comment) | ✅ |

### 3f. typeErrors error-payload shape

| Feature | mion | ts-go-run-types | Match? |
|---|---|---|---|
| format error push | `cpf_formatErr` → `{name, formatPath:[...fPath, param], val}` nested under RunTypeError (baseRunTypeFormat) | `formatErrCall` inline: `er.push({expected:'string',path:[...pth],format:{name,formatPath:[param],val}})` (shared.go:44-51) | ✅ shape matches; emitted inline (not pure-fn) because cpf_formatErr isn't in consumer's program (shared.go:35-38) |
| length error `val` = bound | yes (stringFormat.runtype.ts:86-101) | yes (stringformat.go:184-199) | ✅ |
| complex-param error `val` = message | yes | yes (`messageLiteral`) | ✅ (pattern exception §3b) |
| guard so format errs only on right kind | `getCallJitFormatErr` runs after base check | `baseKindGuard` wraps `if (typeof v==='string') {…}` (typeerrors.go:165-177, 186-196) | ✅ |
| domain/email decomposition error accumulation (no early return) | yes (domain.runtype.ts:145-159, email.runtype.ts:109-117) | yes — `domainErrorsBlockFor`/`emailErrorsBlockFor` accumulate (domain.go:154-194, email.go:89-116) | ✅ |
| email missing-`@` short-circuit | pushes `@` error (email.runtype.ts:112) | `if (atPos===-1) push; else {parts}` — skips part checks on un-splittable (email.go:101-114) | ✅ (slightly cleaner than mion, which still runs part checks) |

## 4. Intentional deviations (by design)

1. **`validateParams` throw → FMT002 build diagnostic.** mion throws at RT-compile inside each `validateParams`; the port runs the same invariants AOT in Go (`ParamValidator.ValidateParams`) and emits `CodeFMTInvalidParams` ("FMT002", SeverityError, codes_runtype.go:143,196). Same guarantees, surfaced as a build diagnostic instead of a runtime throw. (Answers task focus #2 "validated at build".)
2. **`format` transform is a separate RT-fn, not folded into isType/typeErrors.** mion's `emitFormat` is one of several JitFns on the same class; the port splits validation (isType/typeErrors hooks) from mutation (`FormatTransformer.EmitFormatTransform`, applied by `formattransform.go`). Lowercase/Uppercase/Capitalize therefore validate as plain strings and only transform under `createFormatTransform<T>` — matching mion's net behaviour.
3. **One mock fn keyed by name, not per-class `_mock`.** `registerMockingFunction(RunTypeKind.string, mockStringFormat)` with a `switch (annotation.name)` (mockStringFormat.ts:28-54) — the project's documented class→switch convention. Same per-format sample logic.
4. **Brand via two sentinel props instead of deepkit TypeAnnotation.** `__rtFormatName`/`__rtFormatParams` (typeFormat.ts:46-49) — the only mechanism tsgo can carry through to the AOT scanner. `BrandName` stays a pure TS discriminator (ignored by the scanner). Documented in typeFormat.ts:7-14.
5. **`registerFormatPattern` validates samples at JS module-load with the real engine** (formatPattern.ts:66-81), giving a stronger guarantee than mion's compile-time check; the Go RE2 pass (`validateSamples`) is a best-effort build oracle that skips JS-only regex features rather than false-positive (pattern.go:115-128).
6. **Regex hoisted once per factory** via `emitPatternTest`→`NextLocalVar("reFmt")` + context-item dedupe (pattern.go:100-107), mirroring the template-literal isType emitter — a codegen optimisation, not a behaviour change.

## 5. Gaps, mismatches & missed optimisations

Numbered; severity · evidence (file:line) · impact · fix.

1. **Format-error getTypeErrors test surface heavily stubbed — `29` `it.todo` (all STRING_FORMAT). [HEADLINE]** Severity: **Med** (no shipped-code defect — the Go typeErrors hook is wired and the error-payload shape matches mion — but most string-format `format.{name,val,formatPath}` outputs are UNVERIFIED). Evidence: `test/adapters/formatGetTypeErrors.test.ts` has **29 `it.todo(...)`** (counted, not executed) vs **37 live `it()`** (34 case + 3 coverage-guard `'all <X> getTypeErrors tests ran'`); all 29 todos are in the STRING_FORMAT `describe` (NUMBER: 10 live/0 todo, BIGINT: 8 live/0 todo). Root cause: only **15 of 44** STRING_FORMAT cases carry a `getTypeErrors` thunk (`format-validation-suite.ts`, counted). The 29 stubbed cases (formatGetTypeErrors.test.ts:77-120): FormatString minLength / length / minLength+maxLength (:77-79); allowedChars ignoreCase / allowedChars regex-special / disallowedChars (:81-83); allowedValues ignoreCase / allowedValues regex-special / disallowedValues (:85-87); FormatAlphaNumeric / Numeric / Alpha+maxLength / Lowercase (:91-94); FormatUUIDv7 (:96); FormatStringDate DD-MM-YYYY / YYYY-MM / MM-DD (:98-100); FormatStringTime ISO / HH:mm:ss[.mmm] (:101,103); FormatStringDateTime custom (:105); FormatIPv6 / IP-any / IPv4WithPort / IPv6WithPort (:107-110); FormatEmailPunycode (:114); FormatUrlHttp / UrlFile (:117-118); registerFormatPattern slug / {source,flags} (:119-120). Impact: regressions in the format-error wire shape for these 29 would not be caught. Fix: add `getTypeErrors` + `expectedFormatErrors` thunks to the 29 suite cases and fill the todos.

2. **Format MOCK test surface heavily stubbed — `42` `it.todo` (31 STRING + 6 NUMBER + 5 BIGINT). [HEADLINE]** Severity: **Med** (no shipped-code defect — `mockStringFormat` exists for every format — but most generators are UNVERIFIED against their own `isType`). Evidence: `test/adapters/formatMockType.test.ts` has **42 `it.todo(...)`** (counted, not executed) vs **23 live `it()`** (20 case + 3 coverage-guard); STRING block (lines 31-74) has 31 todos (13 of 44 cases carry a `mockType` thunk), NUMBER (87-93) 6, BIGINT (110-114) 5. Root cause: only **13 of 44** STRING cases carry a `mockType` thunk (counted). STRING todos include: every length/char/value FormatString variant except disallowedChars/disallowedValues (:31-43); Alpha+maxLength (:47); all Date layouts except ISO (:52-54); ALL Time + DateTime cases (:55-59); ALL IP cases (:60-64); FormatDomainStrict (:66); FormatEmailPunycode / EmailStrict (:68-69); UrlHttp / UrlFile (:71-72); registerFormatPattern {source,flags} (:74). Impact: the per-format mock generators (date layouts, time/tz, IP v6/port, strict domain/email decomposition mocks) are not asserted to satisfy their validators. Fix: add `mockType` thunks to the suite cases and fill the todos.

3. **URL `domain` / `ip` sub-validation not ported.** Severity: **Low** (the common URL forms — standard/http/file — fully work via the pattern path; only the rarely-used `FormatUrlSocialMedia`-style domain/ip-constrained URL is unavailable). Evidence: mion `url.runtype.ts:60-87,141-161` extracts the host substring and runs a domain (or ip) sub-validator + `emitFormat` host normalisation; the port's `FormatParams_Url` exposes only `pattern`/`mockSamples` (stringFormats.ts:302-305) and `url.go` delegates solely to `namedPatternIsType`/`namedPatternErrors` (url.go:19-25). `FormatUrlSocialMedia` (mion url.runtype.ts:220-222) has no port alias. Impact: cannot constrain a URL's domain to an allowed-list. Fix: add `domain`/`ip` to `FormatParams_Url` and reuse `domainSubCheckExpr`/`domainSubErrorsStmts` (already exported from domain.go) inside the url emitter.

4. **StringFormat `replace` / `replaceAll` transforms not plumbed.** Severity: **Low** (transform-only; isType/typeErrors unaffected). Evidence: mion `emitFormat` handles `replace`/`replaceAll` (stringFormat.runtype.ts:45-47); the port's `EmitFormatTransform` only chains trim/lowercase/uppercase/capitalize and the source comment admits "replace / replaceAll are not yet plumbed through StringParams — a follow-up" (stringformat.go:261-262); `StringParams` (stringFormats.ts:86-102) has no `replace`/`replaceAll` fields. Impact: `FormatString<{replace:…}>` can't be expressed/applied. Fix: add the fields + transform arms.

5. **Email `format` transform (lowercase) not emitted.** Severity: **Low** (validation unaffected; only the canonicalising transform under `createFormatTransform<FormatEmail>`). Evidence: mion `email.runtype.ts:148` `emitFormat` returns `v.toLowerCase()`; the port's `emailEmitter` implements no `EmitFormatTransform` (email.go has none — confirmed: no `FormatTransformer` method on `emailEmitter`), whereas domain/ip/url all do. Impact: an email value isn't lowercased by the transform pass (domain/ip/url are). Fix: add `EmitFormatTransform` returning `vλl+".toLowerCase()"` to `emailEmitter`.

6. **Custom `pattern` errorMessage not surfaced in format error `val`.** Severity: **Low** (deliberate cache-correctness trade-off, but a behavioural divergence from mion). Evidence: mion `getDefaultMessage('pattern', p)` returns `p.pattern.errorMessage || 'Invalid pattern'` (stringFormat.runtype.ts:103,267-268); the port's `messageLiteral` special-cases `pattern` to always emit the static default because the pattern message lives under the key-excluded `message` field (shared.go:89-101, 84-91), and `namedPatternErrors` hardcodes `'pattern'` as the `val` (pattern.go:91). Impact: a user's custom pattern message is lost from the error payload (non-pattern custom messages DO surface). Fix: include `message` in the error `val` while keeping it out of the structural key (it already is excluded), or document the carve-out.

7. **FMT002 build-time param validation is emitted only from the isType walk.** Severity: **Low** (likely benign — isType is rendered for essentially every format-bearing string — but unverified for a format type requested *only* via `createGetTypeErrors`/`createMockType` whose structural id never reaches the isType emitter). Evidence: only `istype.go:182-185` calls `ValidateParams`→`EmitDiagnostic(CodeFMTInvalidParams,…)`; `typeerrors.go` (and the json/binary/transform emitters) do not (grep: `ValidateParams` absent from typeerrors.go). Impact: a misconfigured format used solely through a non-isType family could skip FMT002. Fix: also run `ValidateParams` from the typeErrors arm (deduped per-code-per-walk already), or confirm isType is unconditionally rendered per structural id.

## 6. Test-coverage comparison

**mion specs** (counted, not executed): `packages/type-formats/src/string/*.spec.ts` = **174** `it/test` registrations total — stringFormat 53, time 21, date 18, defaultStringFormats 18 (Alpha/AlphaNumeric/Numeric/Lowercase/Uppercase/Capitalize), domain 17, ip 12, url 12, email 11, uuid 6, dateTime 6. Each spec exercises isType + typeErrors + mock + (where relevant) the `format` transform and `validateParams` throws across many valid/invalid samples and param combinations.

**ts-go-run-types adapters/suites** (counted, not executed):
- `test/suites/format-validation-suite.ts`: **44 STRING_FORMAT** cases (+ 10 NUMBER, 8 BIGINT). Thunk coverage (counted): **isType 44/44**, **getTypeErrors 15/44**, **mockType 13/44**, **expectedFormatErrors 15/44**.
- `test/adapters/formatIsType.test.ts`: **all 44 STRING cases live** (it()), + NUMBER/BIGINT, 3 coverage guards. **0 `it.todo`/`it.skip`** (counted). Per-section `afterEach` counter asserts every suite key has a matching `it()`.
- `test/adapters/formatGetTypeErrors.test.ts`: **37 live `it()` + `29 it.todo`** (0 skip) — all 29 todos STRING_FORMAT (§5 #1).
- `test/adapters/formatMockType.test.ts`: **23 live `it()` + `42 it.todo`** (0 skip) — 31 STRING + 6 NUMBER + 5 BIGINT (§5 #2).
- `test/adapters/formatTransform.test.ts`: **20 live `it()`, 0 todo** — Lowercase/Uppercase/Capitalize/trim/identity/UUID-passthrough/nested-object/branded-array (STRING) + number/bigint identity.
- `test/adapters/formatSerializationRoundTrip.test.ts`: **25 live `it()`, 0 todo** (format-serialization-suite.ts).
- `test/adapters/formatBinaryRoundTrip.test.ts`: **25 live `it()`, 0 todo**.
- **Reported centrally:** `formatGetTypeErrors.test.ts` ~29 skipped/todo; `formatMockType.test.ts` ~42 skipped/todo — consistent with the static counts.

**mion cases/params tested in mion but `it.todo`/absent in ts-go:**
- **getTypeErrors** (29 stubbed, §5 #1): minLength/length/range length-error variants; allowedChars-ignoreCase/-regex-special; disallowedChars; allowedValues-ignoreCase/-regex-special; disallowedValues; AlphaNumeric/Numeric/Alpha+len/Lowercase; UUIDv7; Date DD-MM-YYYY/YYYY-MM/MM-DD; Time ISO/[.mmm]; DateTime custom; IPv6/any/v4-port/v6-port; EmailPunycode; UrlHttp/UrlFile; registerFormatPattern slug/{source,flags}.
- **mock** (31 STRING stubbed, §5 #2): most length/char/value FormatString variants; Alpha+len; all non-ISO Date layouts; ALL Time + DateTime; ALL IP; DomainStrict; EmailPunycode/EmailStrict; UrlHttp/UrlFile; pattern {source,flags}.
- **Not ported at all** (no suite case): URL domain/ip sub-validation + `FormatUrlSocialMedia` (§5 #3); StringFormat `replace`/`replaceAll` transform (§5 #4); `FormatDomainUnicode`/`FormatDomainPunycode` aliases exist (stringFormats.ts:238-249) but have **no** suite case (only `FormatDomain` standard + `FormatDomainStrict` are tested). mion's `validateParams` throw-message specifics are replaced by FMT002 and not asserted in the JS suite (Go-side `ValidateParams` returns messages; no Go unit test located that asserts them).

**Mismatches blessed/undetected:** the custom-pattern-message loss (§5 #6) is consistent across emit and the (live) `string_customErrorMessage` case which uses `allowedValues` (a non-pattern param), so the green suite does not exercise the pattern-message path. URL/email transform gaps (§5 #3, #5) are not covered by any negative test.

## 7. Recommended follow-ups

Prioritised:
1. **Backfill the 29 getTypeErrors `it.todo`** (§5 #1) — add `getTypeErrors`/`expectedFormatErrors` thunks to the 29 STRING suite cases; verify the `{name,formatPath,val}` payload for every format. **Top priority** (largest unverified surface).
2. **Backfill the 42 mock `it.todo`** (§5 #2) — add `mockType` thunks (esp. all Time/DateTime/IP/strict-domain/strict-email layouts); assert each generated value passes its paired `isType`.
3. **Port URL domain/ip sub-validation + `FormatUrlSocialMedia`** (§5 #3) — extend `FormatParams_Url` and reuse the already-exported `domainSubCheckExpr`/`domainSubErrorsStmts`.
4. **Add email `EmitFormatTransform` lowercase** (§5 #5) and **StringFormat `replace`/`replaceAll`** (§5 #4) for transform parity.
5. **Decide the custom-pattern-message policy** (§5 #6) — surface the message in error `val` (it's already excluded from the structural key) or document the carve-out.
6. **Confirm/extend FMT002 emit** beyond the isType arm (§5 #7), or document that isType is always rendered per structural id.
7. **Add suite cases for `FormatDomainUnicode`/`FormatDomainPunycode`** (aliases exist, untested) and a Go unit test asserting each `ValidateParams` message.
