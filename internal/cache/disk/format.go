// Package disk persists per-(typeID, fnTag) JIT artifacts under
// node_modules/.cache/ts-go-run-types/<optsFingerprint>/<typeID>/<fnTag>.json
// so subsequent builds can skip the walker for unchanged types.
//
// Layout invariants (see plan):
//   - Directory name = the short hash (runType.ID) so the filesystem path
//     is identical to the identifier consumers see in emitted JS.
//   - File basename = the cache-module Tag (constants.CacheModules[…].Tag),
//     e.g. "it.json" for isType, "te.json" for typeErrors.
//   - Filename never encodes the version. Version is folded into the typeID
//     hash itself (see internal/caches/runtype.Cache.uniqueDict), so
//     cross-version typeIDs are already distinct paths.
//   - <optsFingerprint> isolates caches across non-version build options
//     (hashLength, literalHashLength, markerName/Module). Version is NOT
//     in this fingerprint for the same reason.
//
// Every cached entry carries a header recording the structural id of the
// entry itself plus the (structural id, hash) of every child referenced
// in the cached factory body. At read time the disk layer re-resolves
// each structural id against the live runtype.Cache; any mismatch
// (different short hash, missing entry, structural drift) is treated as
// a miss and the renderer re-runs the walker.
package disk

// FormatVersion identifies the on-disk JSON layout. Bump whenever the
// JITEntry shape changes incompatibly so stale files written by an older
// binary aren't misread.
const FormatVersion = 1

// ChildRef captures one (structuralID, hash) pair referenced inside a
// cached factory body. Stored alongside the body so the reader can
// re-resolve `hash` against the live dict and bail to a miss if the
// current build's hash for `structuralID` differs (or `structuralID` is
// unknown to the current build at all).
type ChildRef struct {
	StructuralID string `json:"sid"`
	Hash         string `json:"hash"`
}

// JITEntry is the on-disk shape persisted per (typeID, fnTag).
type JITEntry struct {
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
	// ChildRefs is one entry per JIT-dependency hash baked into Line
	// (the `it_<childHash>` namespaced ids in walker.JitDependencies).
	// Empty for leaf entries with no child JIT calls.
	ChildRefs []ChildRef `json:"childRefs"`
}
