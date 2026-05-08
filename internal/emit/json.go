// Package emit produces the two output formats the resolver writes:
//
//   - JSON (deepkit-shaped reference table) — for tools, inspection, debugging
//   - TypeScript module — runtime artifact consumers import to get a
//     fully-knotted deepkit Type graph from a `Map<id, Type>`.
//
// Both share the same in-memory representation (protocol.Dump) and produce
// stable, deterministic output so diffs are minimal across builds.
package emit

import (
	"encoding/json"
	"io"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// JSON writes the dump as pretty-printed JSON. Refs in child slots stay as
// `{kind: -1, id: "<hash>"}` sentinels — the consumer is responsible for
// re-knotting if it doesn't use the generated TS module.
func JSON(w io.Writer, d protocol.Dump) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(d)
}
