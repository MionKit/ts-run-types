package protocol

// PureFnDep identifies a pure-function dependency of a RT-compiled
// function. FilePath is the absolute path of the source file where
// registerPureFnFactory(<Namespace>, <FunctionName>, ...) is invoked.
// The walker uses FilePath at compile time to assert the dependency
// actually exists in source (Go-side AST integrity check); it does
// not reach the emitted JS — the wire shape stays the flat
// "namespace::fnName" string array that the JS-side rtUtils
// consumes today.
type PureFnDep struct {
	Namespace    string
	FunctionName string
	FilePath     string
}
