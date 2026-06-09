// Package disk persists per-(typeID, fnTag) RT artifacts under
// node_modules/.cache/ts-go-run-types/<optsFingerprint>/<typeID>/<fnTag>.json
// so subsequent builds can skip the walker for unchanged types.
//
// Layout invariants (see plan):
//   - Directory name = the short hash (runType.ID) so the filesystem path
//     is identical to the identifier consumers see in emitted JS.
//   - File basename = the cache-module Tag (constants.CacheModules[…].Tag),
//     e.g. "it.json" for isType, "te.json" for typeErrors.
//   - Filename never encodes the version. Version is folded into the typeID
//     hash itself (see internal/compiled/runtype.Cache.uniqueDict), so
//     cross-version typeIDs are already distinct paths.
//   - <optsFingerprint> isolates caches across non-version build options
//     (hashLength, literalHashLength). Version is NOT in this fingerprint
//     for the same reason.
//
// Every cached entry carries a header recording the structural id of the
// entry itself plus the (structural id, hash) of every child referenced
// in the cached factory body. At read time the disk layer re-resolves
// each structural id against the live runtype.Cache; any mismatch
// (different short hash, missing entry, structural drift) is treated as
// a miss and the renderer re-runs the walker.
package disk

// FormatVersion identifies the on-disk JSON layout. Bump whenever the
// RTEntry shape changes incompatibly so stale files written by an older
// binary aren't misread.
//
// v2 added CrossFamilyRefs so a cache hit can reconstruct the entry's
// cross-family `it_<member>`-style edges (previously the collection pass
// in typefns.CrossFamilyItRoots had to bypass the disk cache to observe
// them via the walker). v1 files lack the field, so they (correctly)
// become misses under v2 — a hit returning empty crossFamilyDeps would
// silently break unions on cached production builds.
//
// v3 is the hashed-naming flip: every cached `Line` and `CrossFamilyRef.Prefix`
// now embeds an opaque fnHash (e.g. `WMk0_<id>`) instead of the readable family
// tag (`it_<id>`). v2 files bake the old tag-based keys, so a hit would feed the
// runtime keys it no longer registers — they must become misses.
//
// v4 redefines the `clone` JSON-encoder strategy: its composite body now wraps
// prepareForJsonSafe (shape-derived strip) instead of prepareForJsonSafePreserve
// (preserve extras), while its fnHash is unchanged (the strategy token "clone" is
// the same). A v3 `jeCL` entry bakes the old preserve body, so a hit would emit
// the wrong (extras-preserving) encoder — it must become a miss.
const FormatVersion = 4

// ChildRef captures one (structuralID, hash) pair referenced inside a
// cached factory body. Stored alongside the body so the reader can
// re-resolve `hash` against the live dict and bail to a miss if the
// current build's hash for `structuralID` differs (or `structuralID` is
// unknown to the current build at all).
type ChildRef struct {
	StructuralID string `json:"sid"`
	Hash         string `json:"hash"`
}

// CrossFamilyRef captures one cross-family dependency the cached entry's
// body reaches — a namespaced hash with a FOREIGN family prefix (e.g.
// `it_<memberHash>` referenced inside a `tb` / `pj` entry to discriminate
// a union member). Stored decomposed so the reader can both revalidate
// against hash drift (via StructuralID → Hash, exactly like ChildRef) AND
// reconstruct the namespaced dependency on a cache hit (Prefix + the
// current hash). The prefix is stored explicitly rather than assumed to be
// `it_`, so a future cross-family edge into another family round-trips too.
type CrossFamilyRef struct {
	// Prefix is the namespaced family prefix, everything up to and
	// including the first `_` (e.g. "it_").
	Prefix string `json:"prefix"`
	// StructuralID is the referenced member's structural id at write time,
	// used to detect hash drift across builds (same rule as ChildRef).
	StructuralID string `json:"sid"`
	// Hash is the bare member hash (the namespaced dep with Prefix
	// stripped) baked into the body at write time.
	Hash string `json:"hash"`
}

// RTEntry is the on-disk shape persisted per (typeID, fnTag).
type RTEntry struct {
	// Format is the layout version (FormatVersion). Files whose Format
	// disagrees with the current FormatVersion are treated as misses.
	Format int `json:"version"`
	// StructuralID is the typeID's structural id at write time. The
	// reader requires the live cache's structural id for this typeID to
	// equal this value; any mismatch (hash drift / collision extension)
	// is a miss.
	StructuralID string `json:"structuralID"`
	// Line is the raw `init('<innerName>', …);` JS statement as
	// rendered. No placeholders: hashes are baked in. Reusing the line
	// directly requires every ChildRef to still resolve.
	Line string `json:"line"`
	// ChildRefs is one entry per RT-dependency hash baked into Line
	// (the `it_<childHash>` namespaced ids in walker.RTDependencies).
	// Empty for leaf entries with no child RT calls.
	ChildRefs []ChildRef `json:"childRefs"`
	// CrossFamilyRefs is one entry per cross-family edge the body reaches
	// (walker.CrossFamilyDeps — namespaced hashes with a foreign family
	// prefix, e.g. `it_<member>` inside a `tb` / `pj` entry). Persisted so
	// a cache hit reconstructs the same crossFamilyDeps the fresh walk
	// would have produced; without it the demand-collection pass would see
	// an empty set on a hit and miss the it_<member> roots. Empty for
	// entries with no cross-family edges.
	CrossFamilyRefs []CrossFamilyRef `json:"crossFamilyRefs,omitempty"`
}
