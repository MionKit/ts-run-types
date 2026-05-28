// Public entry for the `@mionjs/ts-go-run-types/formats` subpath — the
// string-format type catalog plus the runtime registrations every format
// relies on. Formats are JS-only TYPE aliases; validation / serialization /
// coercion are emitted on the Go side, keyed off the format name carried in
// the wire-protocol FormatAnnotation. The runtime here only carries the
// per-kind mock switch and the pure-fn / pattern registrations.
//
// Pure-fn registration MUST evaluate before any format module that reaches a
// pure fn at runtime — the Go-emitted cache wires
// `utl.getPureFn('mionFormats::isUUID')` and friends, which the registry
// must already hold. Importing this for its side effect first keeps the
// ordering robust regardless of bundler tree-shaking.
import './string/string-formats-pure-fns.ts';
// Side-effect: registers the single string-format mock fn (mockStringFormat)
// with the runtime mock registry.
import '../mocking/mockStringFormat.ts';
// Side-effect: registerFormatPattern validates each built-in pattern's
// mockSamples against its regex at load.
import './string/string-patterns.ts';

// Re-export the full string-format type surface. Number / BigInt format
// families will land in subsequent phases.
export type * from './string/stringFormats.ts';
