package typeid

import (
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// TemporalInfoForType returns the protocol.TemporalInfo for a *checker.Type
// that resolves to a builtin Temporal type (e.g. `Temporal.PlainDate`), or
// ok=false otherwise. Detection is namespace-qualified: the type's symbol
// name must match a registry entry AND the symbol's parent must be the
// `Temporal` namespace — so a user type named `PlainDate` (no Temporal
// parent) never matches. Shared by the serialize-side projector and the
// structural-id computer so both agree on what a Temporal type is.
func TemporalInfoForType(tsType *checker.Type) (protocol.TemporalInfo, bool) {
	if tsType == nil {
		return protocol.TemporalInfo{}, false
	}
	symbol := tsType.Symbol()
	if symbol == nil || symbol.Parent == nil || symbol.Parent.Name != protocol.TemporalNamespace {
		return protocol.TemporalInfo{}, false
	}
	return protocol.TemporalInfoByName(symbol.Name)
}
