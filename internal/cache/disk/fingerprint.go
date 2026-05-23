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
	HashLength        int
	LiteralHashLength int
	MarkerName        string
	MarkerModule      string
}

// Fingerprint hashes inputs into a stable 12-hex-char prefix used as the
// per-build-options cache directory. Short enough to keep paths
// human-friendly, wide enough that collisions are not a practical
// concern.
func Fingerprint(inputs FingerprintInputs) string {
	var sb strings.Builder
	sb.WriteString("v1\n")
	sb.WriteString(strconv.Itoa(inputs.HashLength))
	sb.WriteByte('\n')
	sb.WriteString(strconv.Itoa(inputs.LiteralHashLength))
	sb.WriteByte('\n')
	sb.WriteString(inputs.MarkerName)
	sb.WriteByte('\n')
	sb.WriteString(inputs.MarkerModule)
	sb.WriteByte('\n')
	sum := sha256.Sum256([]byte(sb.String()))
	return hex.EncodeToString(sum[:])[:12]
}
