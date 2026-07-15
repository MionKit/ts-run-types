# Make fn-hash family prefixes version-independent (drop `constants.Version` from the fnHash salt)

**Status:** todo
**Created:** 2026-07-15

## Problem

Every RT function-cache entry is keyed `<fnHash>_<typeId>`, and the binary
`constants.Version` is folded into **both** halves:

- `typeId` — via `versionSalt()` (`runtype/serialize.go:473`, `constants.Version + "|"`),
  fed through `uniqueDict` into every structural hash.
- `fnHash` — via `fnHashSalt()` (`operations/fnhash.go:20-22`, `constants.Version + "|op|" + canonicalKey`).

Folding it into the `typeId` is load-bearing (it is how cross-version caches are
invalidated). Folding it into the `fnHash` **as well is redundant**: the composite
key already changes across versions because its `typeId` half does. But the
redundant fold has a real cost for consumers: the per-family fn-hash **prefixes are
not stable across versions**, so any consumer that maps `family → prefix` has to
re-pin those constants on every ts-runtypes release.

That is exactly what mion is forced to do — see
`packages/core/src/constants.ts` `JIT_FUNCTION_IDS` and the mion follow-up
`docs/todos/jit-function-ids-version-pinning.md` (mion repo): a hardcoded
`family → 3-char prefix` map that has already been refreshed by hand across
0.9.0 → 0.9.1 → 0.9.2, landing each bump red until refreshed. The family prefix is
an implementation detail of *which operation* an entry belongs to; it should not
move just because the binary version moved.

## Evidence — the version is only needed in the typeId

The disk-cache layer already codifies this exact principle for its own key. From
`internal/cachegen/diskcache/fingerprint.go:10-14`:

```go
// FingerprintInputs are the build-option knobs that change emitted JS
// output other than the binary version. Version is intentionally absent
// — it lives inside every typeID hash (see internal/constants/version.go)
// so cross-version files end up in different typeID directories without
// needing a separate path component.
```

- Disk entries live at `<baseDir>/<fingerprint>/<typeID>/<tag>.json`
  (`diskcache/disk.go:78-97`, `entryPath`). The fingerprint deliberately omits the
  version; the **version-folded `typeID` directory** is what segregates versions on
  disk. The `<tag>` filename is the family/variant tag, not the fnHash.
- The emitted runtime key `<fnHash>_<typeId>` likewise re-hashes across versions
  purely through its `typeId` half.

So both the on-disk cache and the emitted module keys already invalidate correctly
across versions **without** the version living in the fnHash. `runtype/version_test.go`
(`TestVersionEmbedded_HashesDifferAcrossVersions`) documents that the typeId carries
the version specifically so "the on-disk RT cache key [can] key by typeID without an
extra per-version path component."

## Fix plan

### Phase 1 (recommended, low-risk) — drop the version from the fnHash salt

In `operations/fnhash.go`, change `fnHashSalt` from

```go
func fnHashSalt(canonicalKey string) string {
	return constants.Version + "|op|" + canonicalKey
}
```

to a version-independent salt (keep the `|op|` namespace infix — that is what keeps
fn-hashes disjoint from structural type-id hashes, NOT the version):

```go
func fnHashSalt(canonicalKey string) string {
	return "op|" + canonicalKey
}
```

Effect: fn-hashes become **stable across versions** while `typeId` continues to
carry the version, so:

- Cross-version cache invalidation is unchanged (rides the `typeId` half of every
  key, and the version-folded `typeID` disk directory).
- The `mustBeCollisionFree()` init guard is unaffected — it proves distinctness
  within the closed operation set at `FnHashLen`, and the salt prefix is a constant
  applied uniformly to every key, so relative distinctness is preserved (only the
  concrete hash VALUES shift, one final time on the release that ships this).
- Consumers (mion) can pin `family → prefix` ONCE and never refresh it on a version
  bump again.

Companion changes in the same PR:

- Invert/replace `operations/fnhash_test.go` `TestFnHashVersionSensitive` — it
  currently asserts fn-hashes DIFFER across `constants.Version`; the new contract is
  the opposite (fn-hashes are version-STABLE; only type-ids move). Add a
  `TestFnHash_StableAcrossVersions` asserting equality across two `constants.Version`
  values, and keep a `runtype`-side test asserting the composite `<fnHash>_<typeId>`
  key still differs across versions (via the typeId half).
- Update `fnhash.go`'s salt doc-comment (the "folds in the binary Version the same
  way type ids do … auto-invalidated across binary versions" paragraph) to state the
  new rationale: version lives ONLY in the typeId; the fnHash is version-independent
  and the composite key inherits invalidation from its typeId half.
- Re-pin any golden fn-hash literals in the Go/JS suites (one-time), rebuild
  `bin/ts-runtypes`, run `go -C ts-go-runtypes test ./internal/...` + `pnpm test`.
- `diskcache/fingerprint.go` needs no change (version already absent); confirm no
  test hard-codes a version-salted fn-hash value.

### Phase 2 (optional polish) — human-readable family/variant tags instead of the opaque hash

The maintainer suggested using the family name directly instead of a hash "if max
length of any family is 4 chars". Current tag widths (`operations/operations.go`,
`constants/constants.go` `jsonCompositeTags`):

- **AxisNone leaf families (14):** `huk`,`suk`,`uke`,`uku`,`fmt`(3), `tb`,`fb`,`pj`,`rj`,`sj`,`cj`(2), `pjs`,`cjr`(3), `ukuw`(4) — all ≤ 4. ✅
- **JSON composites (7):** `jeCL`,`jeMU`,`jeDI`,`jeCO`,`jdST`,`jdPR`,`jdCO` — all exactly 4. ✅
- **Validate-option variants:** `val`/`verr` + `ValidateVariantSuffix` (`""`,`"NL"`,`"NA"`,`"NLA"`),
  i.e. `valNLA` (6) and `verrNLA` (**7**). ❌ These overflow 4.

So a *uniform* 4-char readable scheme is NOT achievable as-is: the validate /
validationErrors option-variants reach 7 chars. To make Phase 2 work you would
either (a) accept variable-width readable prefixes (the `<prefix>_<typeId>` `_`
delimiter already disambiguates, and no tag contains `_`, so `val_x` vs `valNL_x`
never collide), or (b) compress the validate-variant encoding to a single packed
option-subset char (drop the leading `N`, map the 4 subsets `{∅,L,A,LA}` to one
char) so `val`/`verr` + 1 char stays ≤ 5.

Because Phase 1 already removes the consumer re-pin burden (the opaque prefix is
stable, just not human-readable), Phase 2 is a readability/self-documentation
improvement, not a correctness requirement. Recommend shipping Phase 1 alone unless
a readable, derivable prefix is separately wanted.

## Consumer follow-up (mion)

After Phase 1 ships in a release, mion's `JIT_FUNCTION_IDS` needs ONE final refresh
to the version-independent hashes, after which it never needs refreshing again — or
mion can drop the pin entirely per its own
`docs/todos/jit-function-ids-version-pinning.md` (discover the key from the injected
tuple server-side; ship `family → prefix` with the serialized deps client-side).

## Acceptance

- `fnHashSalt` no longer folds `constants.Version`; fn-hashes are identical across
  two differing `constants.Version` values (new Go test), while the composite
  `<fnHash>_<typeId>` key still differs across versions through its typeId half.
- `mustBeCollisionFree()` still passes at `FnHashLen = 3`.
- Go suite + `pnpm test` green after the one-time golden re-pin.
- A subsequent version bump re-hashes type-ids (and thus the composite keys and the
  disk `<typeID>` directories) but leaves every family fn-hash prefix unchanged.
