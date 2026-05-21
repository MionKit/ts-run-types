package protocol

import (
	"encoding/json"
	"io"
)

// JSON writes the dump as pretty-printed JSON. Refs in child slots stay as
// `{kind: -1, id: "<hash>"}` sentinels — the consumer is responsible for
// re-knotting if it doesn't use the generated TS module.
func JSON(writer io.Writer, dump Dump) error {
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	return encoder.Encode(dump)
}
