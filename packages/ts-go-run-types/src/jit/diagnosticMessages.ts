// Diagnostic-message catalog for alwaysThrow factories. Mirrors the
// (formerly inline) message strings the Go-side emit files used to
// embed in throwing factory bodies; now the Go side ships only the
// code (e.g. 'PJ001') and this file resolves the message at
// materialise time. Codes are stable strings — once shipped, they
// don't change. See docs/UNSUPPORTED-KINDS.md for the wire format
// and the unified throw model.
//
// Source of truth for the codes themselves: internal/diag/codes_runtype.go.
// Hand-maintained for now; codegen-from-Go is a follow-up.

export const DIAGNOSTIC_MESSAGES: Record<string, string> = {
  // prepareForJson
  PJ001: 'Never type cannot be encoded to JSON.',
  PJ002: 'Jit compilation disabled for Non Serializable types.',
  PJ003: 'Function types cannot be encoded to JSON.',
  PJ004: 'Arrays cannot have non-serializable element types (Symbol[], Function[], ...).',
  PJ005: 'Symbol type cannot be reliably encoded — symbols carry runtime identity that does not survive a JSON round-trip.',

  // prepareForJsonSafe (PJS)
  PJS001: 'Never type cannot be encoded to JSON.',
  PJS002: 'Jit compilation disabled for Non Serializable types.',
  PJS003: 'Function types cannot be encoded to JSON.',
  PJS004: 'Arrays cannot have non-serializable element types (Symbol[], Function[], ...).',
  PJS005: 'Symbol type cannot be reliably encoded — symbols carry runtime identity that does not survive a JSON round-trip.',

  // prepareForJsonSafePreserve (PJP)
  PJP001: 'Never type cannot be encoded to JSON.',
  PJP002: 'Jit compilation disabled for Non Serializable types.',
  PJP003: 'Function types cannot be encoded to JSON.',
  PJP004: 'Arrays cannot have non-serializable element types (Symbol[], Function[], ...).',
  PJP005: 'Symbol type cannot be reliably encoded — symbols carry runtime identity that does not survive a JSON round-trip.',

  // restoreFromJson (RJ)
  RJ001: 'Never type cannot be decoded from JSON.',
  RJ002: 'Jit compilation disabled for Non Serializable types.',
  RJ003: 'Function types cannot be decoded from JSON.',
  RJ004: 'Arrays cannot have non-serializable element types (Symbol[], Function[], ...).',
  RJ005: 'Symbol type cannot be reliably decoded — symbols carry runtime identity that does not survive a JSON round-trip.',

  // stringifyJson (SJ)
  SJ001: 'Never type cannot be stringified.',
  SJ002: 'Jit compilation disabled for Non Serializable types.',
  SJ003: 'Function types cannot be stringified.',
  SJ004: 'Arrays cannot have non-serializable element types (Symbol[], Function[], ...).',
  SJ005: 'Symbol type cannot be reliably stringified — symbols carry runtime identity that does not survive a JSON round-trip.',

  // toBinary (TB)
  TB001: 'Never type cannot be serialized to Binary.',
  TB002: 'Jit compilation disabled for Non Serializable types.',
  TB003: 'Function types cannot be serialized to Binary.',
  TB004: 'Arrays cannot have non-serializable element types (Symbol[], Function[], ...).',
  TB005: 'Non-serializable class cannot be serialized to Binary.',
  TB006:
    'Symbol type cannot be reliably serialized — symbols carry runtime identity that does not survive a serialization round-trip.',

  // fromBinary (FB)
  FB001: 'Never type cannot be deserialized from Binary.',
  FB002: 'Jit compilation disabled for Non Serializable types.',
  FB003: 'Function types cannot be deserialized from Binary.',
  FB004: 'Arrays cannot have non-serializable element types (Symbol[], Function[], ...).',
  FB005: 'Non-serializable class cannot be deserialized from Binary.',
  FB006:
    'Symbol type cannot be reliably deserialized — symbols carry runtime identity that does not survive a serialization round-trip.',

  // isType (IT)
  IT001: 'Jit compilation disabled for Non Serializable types.',
  IT002: 'Symbol type cannot be reliably validated — symbol values are not comparable across realms or round-trips.',

  // typeErrors (TE)
  TE001: 'Jit compilation disabled for Non Serializable types.',
  TE002: 'Symbol type cannot be reliably validated — symbol values are not comparable across realms or round-trips.',
};

// messageForCode resolves a diagnostic code (e.g. 'PJ001') to its
// human-readable message. Unknown codes return a generic fallback so
// out-of-band codes (e.g. a future Go-side code not yet mirrored here)
// still produce a useful error rather than crashing.
export function messageForCode(code: string): string {
  return DIAGNOSTIC_MESSAGES[code] ?? `JIT compilation failed for unsupported type (${code})`;
}

// alwaysThrowFactory builds a createJitFn that throws on invocation —
// the throw fires at materialise time (the first `createXxx<T>()`
// call), matching mion's "throws at JIT-compile time" semantic so
// users see the error at the same call site they used to. Used by
// every cache module's init() when the Go side ships an
// alwaysThrowCode (8th arg). The thrown message has the canonical
// `[code] message (at file:line:col)` shape so users can grep by code,
// by phrase, OR jump straight to the offending source. `siteHint` is
// optional — when the Go-side renderer has no provenance for the type
// it ships `undefined` and the suffix is omitted. See
// docs/UNSUPPORTED-KINDS.md "Wire format".
export function alwaysThrowFactory(code: string, siteHint?: string): () => never {
  const base = `[${code}] ${messageForCode(code)}`;
  const message = siteHint ? `${base} (at ${siteHint})` : base;
  return () => {
    throw new Error(message);
  };
}
