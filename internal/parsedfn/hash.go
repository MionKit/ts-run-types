package parsedfn

import (
	"crypto/sha256"
	"encoding/base64"
	"regexp"
	"strings"
)

// bodyHashLength matches mion's BODY_HASH_LENGTH constant
// (mion/packages/devtools/src/vite-plugin/constants.ts:8). Kept here
// rather than in internal/constants/ because it's tightly coupled to
// the hash algorithm — changing one without the other silently breaks
// cross-toolchain artifact loading.
const bodyHashLength = 14

var horizontalWhitespace = regexp.MustCompile(`[ \t]+`)

// BodyHash mirrors mion's algorithm byte-for-byte:
//
//	sha256(namespace + functionName + normalize(code)).Base64URL()[:14]
//
// where normalize collapses runs of spaces/tabs to a single space and trims
// leading/trailing whitespace. Newlines inside the body are preserved (mion
// only collapses horizontal whitespace).
//
// Source ref: mion/packages/devtools/src/vite-plugin/extractPureFn.ts:439-443.
func BodyHash(namespace, functionName, code string) string {
	normalized := strings.TrimSpace(horizontalWhitespace.ReplaceAllString(code, " "))
	sum := sha256.Sum256([]byte(namespace + functionName + normalized))
	return base64.RawURLEncoding.EncodeToString(sum[:])[:bodyHashLength]
}
