// Package skeletons embeds the hand-authored cache-module skeletons (.ts
// files in this directory) so the Go binary can splice generated factory
// calls in at render time. Living next to the .ts files lets //go:embed use
// bare filenames (it forbids `..` traversal).
//
// Dev-only: the npm package's `files` allowlist publishes only `dist/` and
// `README.md`, so this .go file never ships.
package skeletons

import "embed"

//go:embed pureFnsCache.ts
var FS embed.FS
