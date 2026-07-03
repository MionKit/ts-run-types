// Cheap textual pre-filters the lint rules run BEFORE paying a resolver
// round trip. A file that neither references the marker module nor looks
// like an enrichment mirror can produce no RunTypes diagnostics, so the
// rules skip it entirely — the common case for most files in a lint run.

import {FRIENDLY_TYPE_NAME, MARKER_COMMENT_PREFIX, MOCK_DATA_NAME} from '../runtypes-constants.generated.ts';

// MARKER_MODULE mirrors the unplugin's short-circuit: match the package only
// as a quoted import specifier (`'ts-runtypes`, `"ts-runtypes`, incl.
// subpaths) so a path mention in a comment never forces a scan.
// `registerPureFnFactory` is checked separately because the marker package's
// OWN sources call it via relative imports.
const MARKER_MODULE = 'ts-runtypes';

// referencesMarkerModule gates the compiler-diagnostics pass (severity-tier
// rules): only files that can contain marker call sites go to the resolver.
export function referencesMarkerModule(text: string): boolean {
  return text.includes(`'${MARKER_MODULE}`) || text.includes(`"${MARKER_MODULE}`) || text.includes('registerPureFnFactory');
}

// looksLikeEnrichmentFile gates the enrichment rules — the JS twin of the
// Go-side mirror.IsEnrichmentFile guard (which stays authoritative; this one
// only avoids pointless round trips, so it mirrors the same signals): a
// reconcile marker in its EMIT form (the `/** @rtType ` prefix MarkerComment
// writes), or a `: FriendlyType<` / `: MockData<` ANNOTATION (colon
// introducer required). Files that merely mention the tags in strings or
// comments never match, so they never pay a round trip and never fire.
export function looksLikeEnrichmentFile(text: string): boolean {
  return (
    text.includes(MARKER_COMMENT_PREFIX) ||
    hasEnrichAnnotation(text, FRIENDLY_TYPE_NAME) ||
    hasEnrichAnnotation(text, MOCK_DATA_NAME)
  );
}

// hasEnrichAnnotation mirrors the Go-side check: `: <name><` with optional
// whitespace after the colon — the annotation form, never a declaration.
function hasEnrichAnnotation(text: string, name: string): boolean {
  const needle = `${name}<`;
  let from = 0;
  for (;;) {
    const idx = text.indexOf(needle, from);
    if (idx < 0) return false;
    from = idx + 1;
    let cursor = idx - 1;
    while (cursor >= 0 && /\s/.test(text[cursor]!)) cursor--;
    if (cursor >= 0 && text[cursor] === ':') return true;
  }
}

// needsResolverPass is the union gate the rules share: one resolver pass per
// file serves every rule, so the file goes over the wire when EITHER family
// could report on it.
export function needsResolverPass(text: string): boolean {
  return referencesMarkerModule(text) || looksLikeEnrichmentFile(text);
}
