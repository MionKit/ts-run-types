package constants

// Version is the binary version, injected at build time via
//   -ldflags "-X github.com/mionkit/ts-run-types/internal/constants.Version=<v>"
// Embedded into the typeID hashing input (see internal/caches/runtype.assignID)
// so the same structural type gets a different short hash across binary versions —
// any on-disk cache keyed by typeID is automatically version-isolated, no per-
// version directory needed.
//
// Defaults to "dev" for local builds; the publish script overrides it from the
// root package.json version.
var Version = "dev"
