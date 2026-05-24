// Package skeletons embeds the hand-authored cache-module skeletons
// (the .ts files in this directory) so the Go binary can splice
// generated factory calls into them at render time.
//
// Living next to the .ts files lets //go:embed use bare filenames —
// no `..` traversal, which is forbidden by the embed directive. That
// removed the need for the previous mirror under
// internal/cachetpl/skeletons/ and the sync script that kept the two
// copies aligned.
//
// This file is dev-only. The npm package's package.json `files`
// allowlist publishes only `dist/` and `README.md`, so the .go file
// never ships in the tarball. JS toolchains (tsc, eslint, vitest)
// ignore .go extensions, so it's also invisible to the rest of the
// package's build pipeline.
package skeletons

import "embed"

//go:embed runTypesCache.ts isTypeCache.ts getTypeErrorsCache.ts prepareForJsonCache.ts restoreFromJsonCache.ts stringifyJsonCache.ts prepareForJsonFlatCache.ts restoreFromJsonFlatCache.ts stringifyJsonFlatCache.ts hasUnknownKeysCache.ts stripUnknownKeysCache.ts unknownKeyErrorsCache.ts unknownKeysToUndefinedCache.ts pureFnsCache.ts
var FS embed.FS
