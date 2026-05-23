// Public entry point for @mionjs/ts-go-type-formats.
//
// The package is JS-only — every concrete format is a thin
// RunTypeFormat that registers itself at module load. The
// corresponding JIT emit lives on the Go side
// (internal/compiled/typefns/formats/) and is keyed off the format
// name carried in the wire-protocol FormatAnnotation.
//
// Re-exports the public type catalog from StringFormats. Number /
// BigInt format families will land in subsequent phases.
export * from './StringFormats.ts';
