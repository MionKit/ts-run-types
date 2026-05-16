package protocol

import (
	"encoding/json"
	"io"
)

// WriteJSON writes the dump as pretty-printed JSON. Refs in child slots
// stay as `{kind: -1, id: "<hash>"}` sentinels — the consumer is
// responsible for re-knotting if it doesn't use the generated TS module.
func (dump Dump) WriteJSON(writer io.Writer) error {
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	return encoder.Encode(dump)
}
