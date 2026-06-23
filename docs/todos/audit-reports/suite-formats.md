# Suite audit — formats (`format-validation`, `format-serialization`, `format-transform`)

Review-only audit of the three format test-suite groups under
`packages/ts-runtypes/test/suites/`. No code changed.

| group | case files | cases |
|---|---|---|
| format-validation | 6 (NumberFormat, BigintFormat, StringFormat, DateTime, Realworld, CircularGuard) | 101 |
| format-serialization | 6 (NumberFormat, BigintFormat, StringFormat, DateTime, Realworld, CircularGuard) | 27 |
| format-transform | 3 (NumberFormat, BigintFormat, StringFormat) | 18 |
| **total** | **15 case files** | **146** |

Verdict counts (whole audit): **OK 138 · SUSPECT 8 → all 8 now FIXED · WRONG 0.**

All 8 SUSPECT entries were *representativeness* gaps (a format under-sampled vs
its richer siblings), never a correctness defect. All 8 have since been
strengthened with the missing boundary / malformed / empty samples and stay
green (1479 tests pass; no new boundary sample surfaced a validator/encoder
bug). No wrong asserted byte width, no
stale copy-paste bounds, no inverted valid/invalid samples, no transform with a
wrong expected output were found. The two highest-risk drift spots are
explicitly correct: serialization `number_int16` asserts 2 bytes (not a stale 1
cloned from int8), and `bigint_plain_brand` with a `[0,255]` range correctly
stays 8 bytes (no narrow path for bigint) rather than inheriting UInt8's 1-byte
width.

---

# format-validation

Driver: each valid sample must pass, each invalid sample must fail, and each
non-null `expectedFormatErrors[i]` (index-parallel to invalid samples) must be
present by `format.name` (and `val` / `formatPathTail` when supplied). `null`
means "expect ≥1 error, payload unchecked".

### NumberFormat.ts

| case key | intended format/type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| number_max | `Number<{max:100}>` | 100/0/-50 pass; 101→max(val 100), '5' wrong-type | yes | yes | OK | inclusive boundary + wrong-type |
| number_min | `Number<{min:0}>` | 0/1/9999 pass; -1→min(val 0) | yes | yes | OK | |
| number_lt | `Number<{lt:10}>` exclusive | 9/0/-100 pass; 10 & 11→lt(val 10) | yes | yes | OK | boundary rejected (exclusive) |
| number_gt | `Number<{gt:0}>` exclusive | 1/100 pass; 0 & -1→gt(val 0) | yes | yes | OK | |
| number_integer | `Integer` | 0/1/-1/42 pass; 1.5/3.14→integer(val true) | yes | yes | OK | |
| number_float | `Float` | 1.5/-0.5/3.14 pass; 1/0/-2→float(val true) | yes | yes | OK | inverse of Integer |
| number_multipleOf | `Number<{multipleOf:5}>` | 0/5/10/-15 pass; 3/7→multipleOf(val 5) | yes | yes | OK | 0 + negative multiple |
| number_combined | `Number<{min0;max100;integer;multipleOf5}>` | 0/5/50/100 pass; -5/105/7/2.5 each trip a distinct constraint | yes | yes | OK | each invalid pins one path |
| number_int8 | `Int8` [-128,127] | -128/0/127 pass; 128→max,-129→min,1.5→integer | yes | yes | OK | bounds match brand |
| number_uint8 | `UInt8` [0,255] | 0/128/255 pass; 256→max(255),-1→min(0) | yes | yes | OK | tests 256 and -1 |

### BigintFormat.ts

| case key | intended format/type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| bigint_max | `BigInt<{max:100n}>` | 100n/0n/-50n pass; 101n→max, 5(number) wrong-type | yes | yes | OK | |
| bigint_min | `BigInt<{min:0n}>` | 0n/1n/9999n pass; -1n→min | yes | yes | OK | |
| bigint_lt | `BigInt<{lt:10n}>` exclusive | 9n/-5n pass; 10n & 11n→lt(10n) | yes | yes | OK | |
| bigint_gt | `BigInt<{gt:0n}>` exclusive | 1n/100n pass; 0n & -1n→gt(0n) | yes | yes | OK | |
| bigint_multipleOf | `BigInt<{multipleOf:5n}>` | 0n/5n/-15n pass; 3n/7n→multipleOf(5n) | yes | yes | OK | |
| bigint_combined | `BigInt<{min0;max1000;multipleOf10}>` | 0n/10n/1000n pass; -10n/1010n/7n trip distinct | yes | yes | OK | |
| bigint_int64 | `BigInt64` [-2^63,2^63-1] | min/0/max pass; 2^63→max, -(2^63)-1→min | yes | yes | OK | exact 64-bit edges |
| bigint_uint64 | `BigUInt64` [0,2^64-1] | 0n/max pass; 2^64→max, -1n→min | yes | yes | OK | |

### StringFormat.ts (47 cases)

| case key | intended format/type | what it asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| string_maxLength | `String<{maxLength:5}>` | '' / 'hello' pass; 'hello!'→val 5, 42 wrong-type | yes | yes | OK | |
| string_minLength | `String<{minLength:3}>` | 'abc'/'abcd' pass; 'ab' & ''→val 3 | yes | yes | OK | |
| string_length | `String<{length:4}>` | 'abcd' passes; 'abc'/'abcde'→val 4 | yes | yes | OK | under+over |
| string_range | `String<{minLength2;maxLength4}>` | 'ab'/'abcd' pass; 'a'→2, 'abcde'→4 | yes | yes | OK | both bounds |
| string_allowedChars | hex char-set | 'deadbeef'/'0042'/'' pass; 'xyz'→Invalid characters, space fails | yes | yes | OK | |
| string_allowedChars_ignoreCase | `abc` ignoreCase | 'ABC'/'aAbBcC' pass; 'abcd'→Invalid characters | yes | yes | OK | |
| string_allowedChars_literal | `.-` literal | '...---' passes; 'a'→Invalid characters | yes | yes | OK | minimal but adequate |
| string_disallowedChars | blacklist `!@#` | 'hello' passes; 'hi!'/'a@b'→Invalid characters | yes | yes | OK | |
| string_allowedValues | enum red/green/blue | red/blue pass; yellow→Invalid value, RED & redgreen fail | yes | yes | OK | case + substring guards |
| string_allowedValues_ignoreCase | red/green ignoreCase | RED/Green pass; blue→Invalid value | yes | yes | OK | |
| string_allowedValues_escaped | literal a.b/c+d | a.b/c+d pass; axb/ccd→Invalid value | yes | yes | OK | |
| string_disallowedValues | blacklist admin/root | alice passes; admin/root→Invalid value | yes | yes | OK | |
| string_customErrorMessage | custom errorMessage | a/b pass; c→'pick a or b' | yes | yes | OK | asserts custom val |
| alpha | `Alpha` letters-only | Hello/abcXYZ/'' pass; hello1/'hi there'→Invalid pattern | yes | yes | OK | empty passes |
| alphaNumeric | `AlphaNumeric` | abc123/ABC/123 pass; a-b/'a b'→Invalid pattern | yes | yes | OK | |
| numeric | `Numeric` digits | 12345/007 pass; 12.3/12a→Invalid pattern | yes | yes | OK | |
| alpha_withLength | `Alpha<{maxLength:3}>` | abc passes; abcd→val 3, a1→Invalid pattern | yes | yes | OK | two constraints distinguished |
| lowercase_validate | `Lowercase` (transform only) | any string passes; only 42 fails (typeof) | yes | yes | OK | transform not validated (intentional) |
| uuidv4 | `UUIDv4` | V4 passes; V7→val'4', not-a-uuid/''/hyphen-stripped/123 fail | yes | yes | OK | strong v4/v7 distinction |
| uuidv7 | `UUIDv7` | V7 passes; V4→val'7' + wrong-length/non-hex/wrong-version-nibble/''/123 reject | yes | yes | FIXED (was SUSPECT) | added 5 malformed invalids (length, non-hex `g`, version-nibble flip, empty, non-string) for symmetry with uuidv4 |
| date_iso | `StringDate` ISO | leap/normal/0001 pass; reject non-leap/month13/Apr31/single-digit/not-a-date | yes | yes | OK | strong calendar validity |
| date_DMY | `StringDate<DD-MM-YYYY>` | 29-02-2024 passes; ISO-order & 31-04-2024 fail (val DD-MM-YYYY) | yes | yes | OK | |
| date_YM | `StringDate<YYYY-MM>` | 2024-02 passes; 2024-13 & with-day fail | yes | yes | OK | |
| date_MD | `StringDate<MM-DD>` | 02-29 passes; 13-01 & 02-30 (day-overflow) fail | yes | yes | FIXED (was SUSPECT) | added day-overflow invalid `02-30` (Feb has no 30th) |
| date_minMax_absolute | `StringDate` min/max | endpoints+interior pass; 2019-12-31→min, 2021-01-01→max | yes | yes | OK | inclusive boundary |
| time_iso | `StringTime` ISO tz | Z/ms/offset pass; tz-less/hour24/min60→val ISO | yes | yes | OK | |
| time_HHmmss | `StringTime<HH:mm:ss>` | 23:59:59 passes; 99:99:99→val, 23:59 & 24:00:00 fail | yes | yes | OK | |
| time_HHmmss_ms | `StringTime<HH:mm:ss[.mmm]>` | 12:30:45 & .999 pass; .9999→val | yes | yes | OK | optional-ms + width cap |
| time_minMax_absolute | `StringTime` HH:mm min/max | 09:00/12:30/17:00 pass; 08:59→min, 17:01→max | yes | yes | OK | |
| dateTime_default | `StringDateTime` ISO | valid; space→splitChar, non-leap/hour25/garbage fail | yes | yes | OK | |
| dateTime_custom | `StringDateTime` DMY+HH:mm space | valid; ISO-date→date, T-sep→splitChar, hour24→time | yes | yes | OK | all three formatPathTails |
| dateTime_minMax_absolute | `StringDateTime` min/max | endpoints+interior pass; below→min, above→max | yes | yes | OK | reflect/mock seed uses '' (harmless) |
| ipv4 | `IPv4` | 0.0.0.0/255.. pass; 999../256.0.0.1/3-octet/::1 fail (val 4) | yes | yes | OK | octet boundary |
| ipv6 | `IPv6` | full/::1/fe80::1 pass; IPv4 & 12345::1→val 6 | yes | yes | OK | |
| ip_any | `IP` any | v4 & v6 pass; junk→val any | yes | yes | OK | |
| ipv4_port | `IPv4WithPort` | :8080 passes; :70000 (>65535)→val 4 | yes | yes | OK | port-range case |
| ipv6_port | `IPv6WithPort` | [..]:443 passes; :99999→val 6 | yes | yes | OK | |
| domain | `Domain` | multi-label pass; bare/.com/1-char-TLD/-bad/space/'' fail | yes | yes | OK | rich invalid set |
| domainStrict | `DomainStrict` | ≤6 labels pass; -bad/7-labels/numeric-TLD/underscore/localhost fail | yes | yes | OK | strict-only rules |
| email | `Email` | standard incl +tag pass; no-@/too-short/missing-parts/space/'' fail | yes | yes | OK | minLength 7 boundary |
| emailPunycode | `EmailPunycode` | 2 punycode-TLD valids (incl all-`xn--` domain plain Email rejects); not-an-email / empty-label / 1-char-TLD reject | yes | yes | FIXED (was SUSPECT) | added punycode-positive `user@xn--e1afmkfd.xn--p1ai` + 2 near-miss rejects (`john@.xn--fiqs8s`, `john@example.x`) |
| emailStrict | `EmailStrict` | plain pass; a+b@→strict-local-part val, space/@@/underscore-domain/no-@ fail | yes | yes | OK | |
| url | `Url` | http/https/ftp/wss pass; no-scheme/bare-host/mailto/scheme-no-host fail | yes | yes | OK | |
| urlHttp | `UrlHttp` | http/https pass; ftp fails | yes | yes | OK | |
| urlFile | `UrlFile` | file:// passes; https fails | yes | yes | OK | |
| pattern_slug | registered slug | my-slug/a-b-c pass; capitals/space/''→Invalid pattern | yes | yes | OK | |
| pattern_hex | registered hex (i) | 0042/DEADbeef pass; xyz/''→Invalid pattern | yes | yes | OK | |

### DateTime.ts (31 cases)

All native-`Date` / Temporal min/max/gt/lt cases assert inclusive-or-exclusive
boundary samples (±1 unit) plus a wrong-type reject. Every case OK; no defects.

| case key | format/type | asserts | verdict |
|---|---|---|---|
| date_minmax | `Date` min/max | edges pass; one-step-out→min/max; not-a-date null | OK |
| date_gtlt | `Date` gt/lt | interior passes; bounds→gt/lt; not-a-date | OK |
| date_min_lt | `Date` min+lt | min edge & interior pass; below→min, lt edge→lt | OK |
| date_max_now | `Date` max:now | past passes; far-future→max; not-a-date | OK (mock seed differs, harmless) |
| date_rel_window | `Date` now±P1000Y | present passes; yr1000→min, yr3500→max | OK |
| date_rel_datetime_components | `Date` min now-P1000YT12H | present passes; yr1000→min | OK |
| instant_minmax | `Instant` min/max | edges pass; ±1s→min/max; non-instant null | OK |
| instant_gtlt | `Instant` gt/lt | interior passes; bounds→gt/lt | OK |
| instant_rel | `Instant` now±hours | present passes; yr1000→min, yr3500→max | OK |
| plainDate_minmax | `PlainDate` min/max | edges pass; ±1d→min/max; Instant wrong-type reject | OK |
| plainDate_gtlt | `PlainDate` gt/lt | next-day-in pass; edges→gt/lt | OK |
| plainDate_min_lt | `PlainDate` min+lt | min & day-before-lt pass; below→min, lt edge→lt | OK |
| plainDate_gt_max | `PlainDate` gt+max | day-after-gt & max pass; gt edge→gt, above→max | OK |
| plainDate_min_only | `PlainDate` min only | min & far-future pass; below→min | OK |
| plainDate_max_only | `PlainDate` max only | max & far-past pass; above→max | OK |
| plainDate_gt_only | `PlainDate` gt only | next-day passes; gt edge & earlier→gt | OK |
| plainDate_lt_only | `PlainDate` lt only | day-before passes; lt edge & later→lt | OK |
| plainDate_rel_window | `PlainDate` now±P1000Y | present passes; yr0500→min, yr3500→max | OK |
| plainDate_rel_ymd | `PlainDate` min now-P100Y6M15D | present passes; 1800→min | OK |
| plainDate_rel_weeks | `PlainDate` min now-P52200W | present passes; yr0500→min | OK |
| plainTime_minmax | `PlainTime` 09:00–17:00 | edges pass; ±1s→min/max | OK |
| plainTime_gtlt | `PlainTime` gt/lt | ±1s-in pass; edges→gt/lt | OK |
| plainDateTime_minmax | `PlainDateTime` min/max | edges pass; ±1s→min/max | OK |
| plainDateTime_gtlt | `PlainDateTime` gt/lt | interior passes; edges→gt/lt | OK |
| plainDateTime_rel | `PlainDateTime` now±P1000Y | present passes; yr0500→min, yr3500→max | OK |
| plainDateTime_rel_combo | `PlainDateTime` min now-P500YT12H | present passes; yr1000→min | OK |
| plainYearMonth_minmax | `PlainYearMonth` 2020-01..12 | edges pass; ±1mo→min/max | OK |
| plainYearMonth_gtlt | `PlainYearMonth` gt/lt | next-month-in pass; edges→gt/lt | OK |
| plainYearMonth_rel | `PlainYearMonth` now±P1000Y | present passes; 0500-01→min, 3500-01→max | OK |
| zonedDateTime_minmax | `ZonedDateTime[UTC]` min/max | edges pass; ±1s→min/max | OK |
| zonedDateTime_gtlt | `ZonedDateTime[UTC]` gt/lt | interior passes; edges→gt/lt | OK |
| zonedDateTime_rel | `ZonedDateTime[UTC]` now±P1000Y | present passes; yr0500→min, yr3500→max | OK |

### Realworld.ts

| case key | type | asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| user | `{id:UUIDv4; name:string; email:Email}` | 2 valid pass; null/bad-uuid/bad-email/numeric-name fail; uuid then email errors at idx 1,2 | yes | yes | OK | could add an invalid breaking both uuid+email |
| order | `{id:UUIDv4; email:Email; total:number; status:union}` | 2 valid pass; null/bad-uuid/bad-email/out-of-set status fail; uuid/email errors 1,2 (status idx null) | yes | yes | OK | no invalid exercises `total` (string) or missing id; gap only |

### CircularGuard.ts

| case key | type | asserts | verdict | note |
|---|---|---|---|---|
| cycle_with_format_leaf | recursive `{id:UUIDv4; next?:Node}` | guard armed; cyclic value → validate false, getValidationErrors emits `{expected:'circular'}` | OK | uuid leaf valid so cycle is sole failure source |
| dag_with_format_leaf | recursive `{id:UUIDv4; children:Node[]}` | shared-but-acyclic DAG passes, yields `[]` | OK | proves sharing ≠ cycle |

---

# format-serialization

Driver: JSON round-trips through 6 encoder×decoder pairings; binary encodes,
optionally asserts `buf.byteLength === getBinaryByteSizes()[i]`, then decodes and
deep-equals the (deserialized) value. Number formats select a packed binary
width; string/datetime formats serialize as variable-length strings (no width
assertion expected).

### NumberFormat.ts

| case key | format/type | asserts (width + round-trip) | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| number_int8 | `Int8` | byteSizes [1,1,1]; [-128,0,127] | yes (1 byte) | yes (min/zero/max) | OK | |
| number_int16 | `Int16` | byteSizes [2,2,2]; [-32768,0,32767] | yes (2 bytes, NOT stale 1) | yes | OK | drift-risk spot, correct |
| number_int32 | `Int32` | byteSizes [4,4,4]; [-2147483648,0,2147483647] | yes (4 bytes) | yes | OK | |
| number_uint8 | `UInt8` | byteSizes [1,1,1]; [0,128,255] | yes (1 byte) | yes | OK | |
| number_uint16 | `UInt16` | byteSizes [2,2,2]; [0,32768,65535] | yes (2 bytes) | yes | OK | |
| number_uint32 | `UInt32` | byteSizes [4,4,4]; [0,2147483648,4294967295] | yes (4 bytes) | yes | OK | |
| number_integer_8bytes | `Integer` (float64 fallback) | byteSizes [8,8,8]; [10, MAX_SAFE, MIN_SAFE] | yes (8 bytes) | yes | OK | |
| number_float_8bytes | `Float` (float64) | byteSizes [8,8,8]; [10.5,-3.14,1.23e10] | yes (8 bytes) | yes | OK | |
| number_ranged | `Number<{min0;max1000;integer}>`→uint16 | byteSizes [2,2,2]; [0,500,1000] | yes (1000>255 → 2 is narrowest) | yes | OK | |

### BigintFormat.ts

| case key | format/type | asserts (width + round-trip) | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| bigint_int64 | `BigInt64` | byteSizes [8,8,8]; [10n, i64 min, i64 max]; JSON via decimal string | yes (8 bytes) | yes | OK | |
| bigint_uint64 | `BigUInt64` | byteSizes [8,8,8]; [0n,10n,u64 max] | yes (8 bytes) | yes | OK | |
| bigint_positive_string | `BigPositive` (BigInt<{min:0n}>, no max) | NO byteSizes (variable-length); [0n,42n,>uint64-max] | yes (omission correct) | yes (>64-bit proves string path) | OK | width intentionally not asserted |
| bigint_plain_brand | `BigInt<{min0;max255}>` | byteSizes [8,8,8]; [0n,128n,255n] | yes (8 bytes, NOT cloned to UInt8's 1) | yes | OK | key anti-drift case, correct |

### StringFormat.ts

| case key | format/type | asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| string_maxLength | `String<{maxLength:5}>` | var-length string; ['','hello','abc'] round-trip | yes | yes | OK | empty + at-cap + short |
| uuidv4 | `UUIDv4` | 36-char string round-trips; 2 distinct V4 values | yes | yes | FIXED (was SUSPECT) | added 2nd distinct UUID `00112233-4455-4677-8899-aabbccddeeff` |
| date | `StringDate` (ISO string) | string-on-wire; leap/normal/0001 | yes | yes | OK | correctly distinct from native Date |
| email | `Email` | base string; two valid emails | yes | yes | OK | |
| alpha | `Alpha` | base string; ['Hello','abcXYZ'] | yes | yes | OK | |
| object_with_formats | `{id:UUIDv4; name:String<maxLength:20>}` | format brands compose; 3 values incl empty + at-cap name | yes | yes | FIXED (was SUSPECT) | added empty-name `''` and 20-char at-cap-boundary name values |
| email_array | `Email[]` | brand propagates through element; 2-elem, empty `[]`, 1-elem arrays | yes | yes | FIXED (was SUSPECT) | added empty-array `[]` (length-prefix boundary) + single-element array |

### DateTime.ts

| case key | format/type | asserts | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| date | `Date<{min,max}>` | toJSON ISO + Date-ctor restore; binary numeric; 3 Dates incl ms-precision + range-edge | yes | yes | FIXED (was SUSPECT) | added ms-precision Date (`…12:30:45.123`) + range lower-edge Date (`2020-01-01`) |
| instant | `Instant<{min,max}>` | canonical string + .from(); 1 value | yes | yes | OK | |
| plainDate | `PlainDate<{min,max}>` | YYYY-MM-DD + .from(); 1 value | yes | yes | OK | |
| plainTime | `PlainTime<{min,max}>` | HH:mm:ss + .from(); 1 value | yes | yes | OK | no sub-second sample (minor) |
| plainDateTime | `PlainDateTime<{min,max}>` | YYYY-MM-DDTHH:mm:ss + .from(); 1 value | yes | yes | OK | |
| plainYearMonth | `PlainYearMonth<{min,max}>` | YYYY-MM toJSON + .from(); 1 value | yes | yes | OK | restore equal via helper |
| zonedDateTime | `ZonedDateTime<{min,max}>` | toJSON with [UTC] annotation + .from(); 1 value | yes | yes | OK | zone preserved |

### Realworld.ts

| case key | type | asserts | verdict | note |
|---|---|---|---|---|
| user | `{id:UUIDv4; name; email:Email}` | brands→plain strings; symmetric round-trip; 2 values | OK | schema mirror matches |
| order | `{id:UUIDv4; email:Email; total:number; placedAt:Date; status:union}` | uuid/email strings, Date→ISO→Date, total packed, union status; 2 values | OK | total:0 boundary; 2 of 4 union arms (minor) |

### CircularGuard.ts

| case key | type | asserts | verdict | note |
|---|---|---|---|---|
| cycle_with_format_leaf | recursive `{id:UUIDv4; next?:Node}` | self-cycle → encoders THROW (rejectCircularRefs); expectThrows | OK | |
| dag_with_format_leaf | recursive `{id:UUIDv4; children:Node[]}` | shared acyclic DAG encodes without throw | OK | DAG control |

---

# format-transform

Driver: build the transform fn, assert `transform(input)` deep-equals `expected`
for every pair. Non-transforming formats are identity. SUSPECT only flags inputs
that never actually exercise the transform (a broken transform would still pass).

### NumberFormat.ts

| case key | transform | input→expected | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| identity_integer | identity (Integer) | 42→42, -7→-7 | yes | n/a (identity) | OK | |
| identity_int8 | identity (Int8) | 127→127 | yes | n/a | OK | single value (minor) |
| identity_ranged | identity (Number min0/max100, no clamp) | 50→50 | yes | n/a | OK | could feed out-of-range to prove no clamp |
| nested_number_field | identity nested {count, label} | {count:5,label:'KEEP'}→same | yes | n/a | OK | |

### BigintFormat.ts

| case key | transform | input→expected | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| identity_int64 | identity (BigInt64) | 5n→5n, i64-min→same | yes | n/a (incl boundary) | OK | |
| identity_ranged | identity (BigInt min0/max1000, no clamp) | 500n→500n | yes | n/a | OK | could feed out-of-range |

### StringFormat.ts

| case key | transform | input→expected | faithful? | representative? | verdict | issue / fix |
|---|---|---|---|---|---|---|
| lowercase | lowercase | 'ABC'→'abc', 'MixedCase'→'mixedcase' | yes | yes | OK | |
| uppercase | uppercase | 'abc'→'ABC' | yes | yes (not cloned-from-lowercase) | OK | |
| capitalize | capitalize first | 'hello'→'Hello' | yes | yes | OK | |
| trim | strip surrounding ws | '  padded  '→'padded' | yes | yes | OK | no empty-string edge (minor) |
| replace | replace FIRST match | 'banana'→'bXnana', 'no-match'→'no-mXtch' | yes | yes (banana proves first-only) | OK | |
| replaceAll | replace EVERY match | 'banana'→'bXnXnX', 'aaa'→'XXX' | yes | yes | OK | |
| email_lowercase | lowercase email | 'John@Example.COM'→'john@example.com', 'already@lower.io'→same | yes | yes | OK | |
| identity_plain_string | identity (plain string) | 'ABC'→'ABC' | yes | n/a (uppercase guards stray-lowercase) | OK | |
| identity_length_only | identity (maxLength only) | 'ABC'→'ABC' | yes | n/a | OK | |
| identity_uuid | identity (UUIDv4) | uppercase UUID→unchanged | yes | n/a (uppercase guards) | OK | |
| nested_object | transform branded field only | {name:'ALICE',age:30,tag:'KEEP'}→{name:'alice',...} | yes | yes ('KEEP' sibling proves selectivity) | OK | |
| branded_array_elements | lowercase each element | ['A','Bc','DEF']→['a','bc','def'] | yes | yes | OK | |

---

## Findings summary

No WRONG cases in any of the three groups. No wrong asserted byte width, no
stale copy-paste bounds, no inverted samples, no wrong transform output.

**SUSPECT — under-sampled relative to siblings (representativeness gap only; the
assertions present were all correct). All 8 now FIXED — samples added, suites
stay green:**

- *Single invalid sample / missing malformed+empty+wrong-type set* —
  `format-validation/StringFormat.ts`: `uuidv7` (added wrong-length / non-hex /
  wrong-version-nibble / empty / non-string invalids), `date_MD` (added the
  day-overflow `02-30`), `emailPunycode` (added an all-`xn--` punycode-positive
  valid plus two near-miss rejects `john@.xn--fiqs8s` / `john@example.x`).
- *Single happy round-trip value, no boundary / empty-collection* —
  `format-serialization`: `StringFormat.uuidv4` (added a 2nd distinct UUID),
  `StringFormat.object_with_formats` (added empty-name + 20-char at-cap name),
  `StringFormat.email_array` (added the empty-array `[]` length-prefix boundary
  + a single-element array), `DateTime.date` (added a ms-precision Date + a
  range lower-edge Date).

**Anti-drift spots verified correct (highest risk, no defect):**

- `format-serialization/NumberFormat.number_int16` asserts 2 bytes (not a stale
  1 cloned from int8); `int32`/`uint16`/`uint32` widths all match their brands.
- `format-serialization/BigintFormat.bigint_plain_brand` with a `[0,255]` range
  correctly stays 8 bytes (bigint has no narrow path) instead of inheriting
  UInt8's 1-byte width; the TS-divergence is documented in the case.
- `format-transform/StringFormat`: `uppercase` is genuinely uppercase (not a
  lowercase clone); `replace` vs `replaceAll` are distinguished by the
  multi-match `banana` input; identity string cases use UPPERCASE inputs so a
  stray lowercasing transform would be caught.

**Non-blocking notes (not flagged):** identity number/bigint ranged transform
cases never feed an out-of-range value (acceptable — clamping is not a
transform-phase op, the transform is identity by design); a few validation cases
carry a `mockType`/reflect type seed that differs from the validated type
(`date_max_now`, `dateTime_minMax_absolute`) but it only drives `T`-inference /
mock generation and doesn't affect the valid/invalid assertions.
