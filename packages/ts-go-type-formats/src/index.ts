// Public entry point for @mionjs/ts-go-type-formats.
//
// The package is JS-only — formats are pure TYPE aliases (string/
// stringFormats.ts); the runtime carries only the per-kind mock switch
// and the pure-fn / pattern registrations. The corresponding JIT emit
// lives on the Go side (internal/compiled/typefns/formats/), keyed off
// the format name carried in the wire-protocol FormatAnnotation.
//
// Pure-fn registration MUST evaluate before any format module that
// reaches a pure fn at runtime — the Go-emitted cache wires
// `utl.getPureFn('mionFormats::isUUID')` and friends, which the
// registry must already hold. Importing this for its side effect
// first keeps the ordering robust regardless of bundler tree-shaking.
import './string/string-formats-pure-fns.ts';

// Re-exports the public type catalog from StringFormats. Number /
// BigInt format families will land in subsequent phases.
export * from './StringFormats.ts';
