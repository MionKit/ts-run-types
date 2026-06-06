package disk

import (
	"crypto/sha256"
	"encoding/hex"
	"strconv"
	"strings"
)

// FingerprintInputs are the build-option knobs that change emitted JS
// output other than the binary version. Version is intentionally absent
// — it lives inside every typeID hash (see internal/constants/version.go)
// so cross-version files end up in different typeID directories without
// needing a separate path component.
//
// Add a field here whenever a new option starts affecting cache bodies;
// the resulting fingerprint moves and the previous cache is naturally
// orphaned.
type FingerprintInputs struct {
	HashLength int
	// EmitCreateRTFn mirrors typefns.RenderOpts.EmitCreateRTFn —
	// modules emitted with the inline factory have a different `Line`
	// payload (arg-7 carries the full closure) than the default
	// (arg-7 = `u`). Folding it into the fingerprint keeps the two
	// modes in distinct cache subdirs so flipping the flag never
	// reads a stale entry from the other mode.
	EmitCreateRTFn bool
}

// Fingerprint hashes inputs into a stable 12-hex-char prefix used as the
// per-build-options cache directory. Short enough to keep paths
// human-friendly, wide enough that collisions are not a practical
// concern.
//
// The version tag bumps whenever an input is dropped, so caches written
// by older binaries land under a different prefix: "v1"→"v2" dropped the
// MarkerName / MarkerModule inputs (marker migration), "v2"→"v3" dropped
// LiteralHashLength (literal ids merged into the single hash dictionary).
func Fingerprint(inputs FingerprintInputs) string {
	var sb strings.Builder
	sb.WriteString("v3\n")
	sb.WriteString(strconv.Itoa(inputs.HashLength))
	sb.WriteByte('\n')
	sb.WriteString(strconv.FormatBool(inputs.EmitCreateRTFn))
	sb.WriteByte('\n')
	sum := sha256.Sum256([]byte(sb.String()))
	return hex.EncodeToString(sum[:])[:12]
}
