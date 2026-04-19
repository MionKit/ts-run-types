// Package protocol defines the wire types exchanged between the ts-run-types
// resolver and its callers (Vite plugin, one-shot CLI, test harness).
//
// The resolver speaks newline-delimited JSON on stdio by default. Every
// request carries an `op` discriminator; every response either carries a
// resolved type id plus the updated type table, or an error.
package protocol

// Request is the union of all query operations. Exactly one of the
// op-specific fields is populated per request.
type Request struct {
	// Operation name. One of:
	//   "resolveAnnotation"       — resolve the type annotation at Pos
	//   "resolveTypeArgument"     — resolve the Index'th type argument of the call at CallPos
	//   "resolveArgumentInferred" — resolve the inferred type of the Index'th argument of the call at CallPos
	//   "resolveSymbol"           — resolve the inferred type of the identifier at Pos
	//   "dump"                    — return the full type table and site map so far
	Op string `json:"op"`

	// File is the absolute (or cwd-relative) path to the .ts/.tsx source.
	File string `json:"file,omitempty"`

	// Pos is the byte offset of the target node (annotation, identifier).
	Pos int `json:"pos,omitempty"`

	// CallPos is the byte offset of the CallExpression being queried.
	CallPos int `json:"callPos,omitempty"`

	// Index is the positional argument or type-argument index.
	Index int `json:"index,omitempty"`
}

// Response is returned per request. On success, ID identifies the resolved
// type in the shared type table; Added lists type nodes newly produced by this
// query (the caller merges them into its local cache).
type Response struct {
	ID    string     `json:"id,omitempty"`
	Added []TypeNode `json:"added,omitempty"`
	Sites []Site     `json:"sites,omitempty"` // for "dump"
	Types []TypeNode `json:"types,omitempty"` // for "dump"
	Error string     `json:"error,omitempty"`
}

// Site records which call position resolved to which type id.
type Site struct {
	File string `json:"file"`
	Pos  int    `json:"pos"`
	ID   string `json:"id"`
}

// TypeNode is the JSON-friendly projection of a typescript-go type. The shape
// is intentionally flat and deduplicated by ID so it round-trips through JSON
// and rebuilds into a graph on the consuming side.
type TypeNode struct {
	ID         string              `json:"id"`
	Kind       Kind                `json:"kind"`
	Name       string              `json:"name,omitempty"`    // for primitives / type references
	Alias      string              `json:"alias,omitempty"`   // user-declared type alias name (e.g. "User")
	Literal    any                 `json:"literal,omitempty"` // literal type value (string/number/bool)
	Properties map[string]Property `json:"properties,omitempty"`
	Parameters []Parameter         `json:"parameters,omitempty"` // function kind
	Return     string              `json:"return,omitempty"`     // function return type id
	Members    []string            `json:"members,omitempty"`    // union / intersection
	ItemType   string              `json:"itemType,omitempty"`   // array
	Elements   []string            `json:"elements,omitempty"`   // tuple
	Signatures []Signature         `json:"signatures,omitempty"` // extra call/construct sigs on object types
	Flags      []string            `json:"flags,omitempty"`      // e.g. "readonly", "optional"
}

type Kind string

const (
	KindPrimitive    Kind = "primitive"
	KindLiteral      Kind = "literal"
	KindObject       Kind = "object"
	KindFunction     Kind = "function"
	KindUnion        Kind = "union"
	KindIntersection Kind = "intersection"
	KindArray        Kind = "array"
	KindTuple        Kind = "tuple"
	KindEnum         Kind = "enum"
	KindAny          Kind = "any"
	KindUnknown      Kind = "unknown"
	KindNever        Kind = "never"
	KindVoid         Kind = "void"
	KindNull         Kind = "null"
	KindUndefined    Kind = "undefined"
)

type Property struct {
	Type     string `json:"type"`
	Optional bool   `json:"optional,omitempty"`
	Readonly bool   `json:"readonly,omitempty"`
}

type Parameter struct {
	Name     string `json:"name"`
	Type     string `json:"type"`
	Optional bool   `json:"optional,omitempty"`
	Rest     bool   `json:"rest,omitempty"`
}

type Signature struct {
	Parameters []Parameter `json:"parameters"`
	Return     string      `json:"return"`
}

// Dump is the full resolver state emitted at end-of-build. It is also the
// shape of the JSON file the Vite plugin writes to disk for runtime consumers.
type Dump struct {
	Types []TypeNode `json:"types"`
	Sites []Site     `json:"sites"`
}
