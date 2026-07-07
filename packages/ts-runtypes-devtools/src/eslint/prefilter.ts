// Cheap textual pre-filters the lint rules run BEFORE paying a resolver
// round trip. A file that neither references the marker module nor looks
// like an enrichment mirror can produce no RunTypes diagnostics, so the
// rules skip it entirely — the common case for most files in a lint run.

import {FRIENDLY_TEXT_NAME, FRIENDLY_TYPE_NAME, MARKER_COMMENT_PREFIX, MOCK_DATA_NAME} from '../runtypes-constants.generated.ts';

// MARKER_MODULE mirrors the unplugin's short-circuit: match the package only
// as a quoted import specifier (`'@ts-runtypes/core`, `"@ts-runtypes/core`, incl.
// subpaths) so a path mention in a comment never forces a scan.
// `registerPureFnFactory` is checked separately because the marker package's
// OWN sources call it via relative imports.
const MARKER_MODULE = '@ts-runtypes/core';

// referencesMarkerModule gates the compiler-diagnostics pass (severity-tier
// rules): only files that can contain marker call sites go to the resolver.
export function referencesMarkerModule(text: string): boolean {
  return text.includes(`'${MARKER_MODULE}`) || text.includes(`"${MARKER_MODULE}`) || text.includes('registerPureFnFactory');
}

// enrichConstAnnotationPattern mirrors the Go-side guard's structural probe: a
// (possibly exported) CONST declaration annotated with a DSL type — the exact
// shape every scaffold emits. The Go guard additionally masks comments before
// matching (a JSDoc code example there never counts); this pre-filter skips
// the masking — a rare comment-only match just pays one resolver round trip
// that the authoritative Go guard then rejects.
// FRIENDLY_TYPE_NAME (legacy) stays in the alternation so mirrors authored
// before the friendly-text rename still match the pre-filter.
const enrichConstAnnotationPattern = new RegExp(
  `^[ \\t]*(?:export[ \\t]+)?const[ \\t]+[A-Za-z_$][A-Za-z0-9_$]*[ \\t]*:\\s*(?:${FRIENDLY_TEXT_NAME}|${FRIENDLY_TYPE_NAME}|${MOCK_DATA_NAME})[ \\t]*<`,
  'm'
);

// looksLikeEnrichmentFile gates the enrichment rules — the JS twin of the
// Go-side mirror.IsEnrichmentFile guard (which stays authoritative; this one
// only avoids pointless round trips, so it mirrors the same signals): a
// reconcile marker in its EMIT form (the `/** @rtType ` prefix MarkerComment
// writes), or the DSL-annotated const declaration. Files that merely mention
// the tags or types in strings, prose, or parameter annotations never match,
// so they never pay a round trip and never fire.
export function looksLikeEnrichmentFile(text: string): boolean {
  return text.includes(MARKER_COMMENT_PREFIX) || enrichConstAnnotationPattern.test(text);
}

// needsResolverPass is the union gate the rules share: one resolver pass per
// file serves every rule, so the file goes over the wire when EITHER family
// could report on it.
export function needsResolverPass(text: string): boolean {
  return referencesMarkerModule(text) || looksLikeEnrichmentFile(text);
}
