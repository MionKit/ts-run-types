# Mocking gaps: fmt transforms never applied; domain allowedValues ignored; pattern message not surfaced — DONE

Three findings from the mion type-formats migration (2026-07-12), all verified against
@ts-runtypes/core 0.9.1. All three fixed.

## 1. `createMockData` never applied lowercase/uppercase/capitalize format transforms

`lookupFormatTransform` looked up `'fmt_' + runType.id`, but compiled entries are keyed
`'<fnHash>_<typeId>'` with an opaque, version-folded 3-char fnHash — the literal prefix
could never match, so mocks silently skipped declared case transforms.

**Shipped**: `rtUtils.findRTForType(familyTag, typeId)` — a suffix + familyTag scan over
the fn cache (cold-path only; hot paths receive full keys from injected markers) — and
`lookupFormatTransform` resolves the `fmt` family through it. Pinned in
`features/mockSoundness.test.ts` (a `Lowercase<…>` mock comes back canonical-case when a
`createFormatTransform` demand site exists).

## 2. Domain-part `allowedValues` mocks failed their own validator

`mockDomain` read only `mockSamples`/`pattern.mockSamples` and fell back to
`'example.com'`, ignoring `allowedValues.val` — so `validate(mock())` was false for
allowedValues-restricted domains.

**Shipped**: `mockDomain` draws from `allowedValues.val` FIRST (mirroring the plain
string-format path), and `DomainParams` declares the `allowedValues` param the build
already accepted. Pinned in mockSoundness.test.ts (mock ∈ allowed set, validates true).

## 3. `registerFormatPattern`'s `message` was not surfaced as the error val

The doc promised the message is "surfaced in diagnostics/errors", but the emitter always
took the static `'Invalid pattern'` default because `message` was excluded from cache
identity (surfacing it risked cross-site collisions).

**Shipped**: format params are fully id-relevant now (see the companion
format-pattern-samples-dedup-and-length-soundness.md change), so
`messageLiteral` (shared.go) reads the pattern's `message` — the error's `format.val` is
the registered message. The suite `Slug` case (which pinned the old fallback with an
explanatory lament) now pins the message; mockSoundness.test.ts adds an inline-pattern
case.

## mion follow-up (documented, not in this repo)

mion's type-formats specs replaced old deepkit pattern messages with 'Invalid pattern'
defaults during the migration — after upgrading, registered messages surface again and
those expectations can be restored per-format.
