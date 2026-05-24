// Default string formats — thin FormatString aliases. Mirrors mion's
// defaultStringFormats.runtype.ts. No new runtype class: every alias
// resolves to a FormatString<...>, handled by the registered
// StringRunTypeFormat + the Go stringFormatEmitter (which now handles
// the `pattern` param).
//
// - Alpha / AlphaNumeric / Numeric pin a unicode char-class pattern +
//   mockSamples (validated against the pattern at build time).
// - Lowercase / Uppercase / Capitalize are TRANSFORMERS. They do not
//   constrain the validated value — a lowercase format still accepts
//   any string at the isType / typeErrors layer (the transform only
//   applies in a `format` pass, which this AOT port does not emit).

import type {FormatString, StringParams} from './stringFormat.runtype.ts';

// Mirror mion's ALPHA_REGEX / ALPHANUMERIC_REGEX / NUMERIC_REGEX
// (unicode property escapes). Sources as string-literal types.
type ALPHA_SRC = '^[\\p{L}]+$';
type ALPHANUMERIC_SRC = '^[\\p{L}\\p{N}]+$';
type NUMERIC_SRC = '^[\\p{N}]+$';

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type FormatAlpha<P extends StringParams = {}> = FormatString<
  P & {pattern: {source: ALPHA_SRC; flags: 'u'}; mockSamples: ['abc', 'Hello', 'World']}
>;
export type FormatAlphaNumeric<P extends StringParams = {}> = FormatString<
  P & {pattern: {source: ALPHANUMERIC_SRC; flags: 'u'}; mockSamples: ['abc123', 'Test42', 'XYZ0']}
>;
export type FormatNumeric<P extends StringParams = {}> = FormatString<
  P & {pattern: {source: NUMERIC_SRC; flags: 'u'}; mockSamples: ['123', '007', '42']}
>;
export type FormatLowercase<P extends StringParams = {}> = FormatString<P & {lowercase: true}>;
export type FormatUppercase<P extends StringParams = {}> = FormatString<P & {uppercase: true}>;
export type FormatCapitalize<P extends StringParams = {}> = FormatString<P & {capitalize: true}>;
/* eslint-enable @typescript-eslint/no-empty-object-type */
