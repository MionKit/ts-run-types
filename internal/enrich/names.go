package enrich

// FriendlyTypeName / MockDataName are the public ts-runtypes DSL type names an
// enrichment const is annotated with (`const x: FriendlyType<T> = {…}`).
// Shared by the mirror emitters (import header, const wrappers), the AST
// checkers (annotation detection), and the hygiene file guard, so the four
// never drift apart.
const (
	FriendlyTypeName = "FriendlyType"
	MockDataName     = "MockData"
)
