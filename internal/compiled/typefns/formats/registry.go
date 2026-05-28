// Package formats is the Go-side registry of TypeFormat emitters. Each
// concrete format ("stringFormat", "uuid", "email", …) registers an
// Emitter via Register from its own init(). The host rt-fn emitters
// (istype, typeerrors, …) call Lookup at compile time and splice the
// per-format JS into their own output.
//
// Sibling of the JS-side runtime registry (packages/ts-go-run-types/src/
// runtypes/formatRegistry.ts) — the two are kept in lock-step by
// convention: every format ships a Go file under this subtree AND a
// JS RunTypeFormat in `ts-go-type-formats`. Names must match.
package formats

import (
	"sync"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// Emitter is the per-format hook surface. A format implements as many
// of the optional methods as make sense (`""` from a method means "no
// format-specific behaviour — fall back to the base-kind emit"). Name
// + Kind are mandatory: they form the registry key.
type Emitter interface {
	// Name returns the canonical format name. Matches the
	// FormatAnnotation.Name on RunTypes that should dispatch here.
	Name() string

	// Kind returns the base ReflectionKind this format wraps. KindString
	// for FormatString / FormatUUID / FormatEmail; KindNumber for the
	// number-format family; etc. Used as a sanity guard — Lookup
	// rejects entries whose Kind doesn't match the host RunType.
	Kind() protocol.ReflectionKind

	// EmitIsTypeCheck returns a JS expression (no `return`) evaluating
	// to true when `vλl` satisfies the format constraints in
	// annotation.Params. Empty string means "no additional check
	// beyond the base-kind validator" — the host emitter then leaves
	// its output unchanged.
	EmitIsTypeCheck(annotation *protocol.FormatAnnotation, vλl string) string

	// EmitTypeErrorsCheck returns a JS statement that, when executed,
	// pushes a TypeFormatError onto the errors array (named
	// errorsArr) for `vλl` at `pathExpr` if the value fails this
	// format. Empty string means "no format-specific error — the
	// caller's base-kind error path is sufficient".
	EmitTypeErrorsCheck(annotation *protocol.FormatAnnotation, vλl, pathExpr, errorsArr string) string
}

var (
	registryMu sync.RWMutex
	registry   = map[registryKey]Emitter{}
)

type registryKey struct {
	kind protocol.ReflectionKind
	name string
}

// Register adds an Emitter to the global table. Intended for use from a
// per-format file's init(): `func init() { formats.Register(stringFormat{}) }`.
// Re-registering the same (kind, name) pair panics — drift between two
// emitters claiming the same format is always a bug, never a fallback
// case worth tolerating silently.
func Register(emitter Emitter) {
	key := registryKey{kind: emitter.Kind(), name: emitter.Name()}
	registryMu.Lock()
	defer registryMu.Unlock()
	if _, exists := registry[key]; exists {
		panic("formats.Register: duplicate emitter for " + key.name)
	}
	registry[key] = emitter
}

// Lookup returns the Emitter registered for (kind, name), or (nil,
// false) when no concrete emitter exists. A missing entry is NOT an
// error — host emitters fall back to the kind-default validation. This
// is the same forward-compat lever that lets Phase 0 ship with an
// empty registry and gracefully no-op for any FormatAnnotation it
// encounters.
func Lookup(kind protocol.ReflectionKind, name string) (Emitter, bool) {
	registryMu.RLock()
	defer registryMu.RUnlock()
	emitter, ok := registry[registryKey{kind: kind, name: name}]
	return emitter, ok
}

// LookupForRunType is a convenience wrapper around Lookup keyed off the
// RunType's Kind + FormatAnnotation.Name. Returns (nil, false) when rt
// has no FormatAnnotation set.
func LookupForRunType(rt *protocol.RunType) (Emitter, bool) {
	if rt == nil || rt.FormatAnnotation == nil {
		return nil, false
	}
	return Lookup(rt.Kind, rt.FormatAnnotation.Name)
}
