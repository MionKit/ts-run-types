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
	// EmitMode mirrors typefns.RenderOpts.EmitMode ("code" / "functions" /
	// "both") — each mode renders different code/factory slots, so folding it
	// into the fingerprint keeps the three modes in distinct cache subdirs and
	// switching modes never reads a stale entry from another.
	EmitMode string
}

// Fingerprint hashes inputs into a stable 12-hex-char prefix used as the
// per-build-options cache directory. Short enough to keep paths
// human-friendly, wide enough that collisions are not a practical
// concern.
//
// The version tag bumps whenever an input is dropped or changes shape, so
// caches written by older binaries land under a different prefix: "v1"→"v2"
// dropped the MarkerName / MarkerModule inputs (marker migration), "v2"→"v3"
// dropped LiteralHashLength (literal ids merged into the single hash
// dictionary), "v3"→"v4" replaced the EmitCreateRTFn bool with the EmitMode
// tri-state string.
func Fingerprint(inputs FingerprintInputs) string {
	var sb strings.Builder
	sb.WriteString("v4\n")
	sb.WriteString(strconv.Itoa(inputs.HashLength))
	sb.WriteByte('\n')
	sb.WriteString(inputs.EmitMode)
	sb.WriteByte('\n')
	sum := sha256.Sum256([]byte(sb.String()))
	return hex.EncodeToString(sum[:])[:12]
}
