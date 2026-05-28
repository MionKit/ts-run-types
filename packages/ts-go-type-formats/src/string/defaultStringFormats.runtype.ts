// Default string formats — thin FormatString aliases. Mirrors mion's
// defaultStringFormats.runtype.ts. No new runtype class: every alias
// resolves to a FormatString<...>, so the already-registered
// StringRunTypeFormat + the Go stringFormatEmitter handle them.
//
// - Alpha / AlphaNumeric / Numeric pin a `charClass` (validated by the
//   cpf_isCharClass pure fn via the stringFormat emitter).
// - Lowercase / Uppercase / Capitalize are TRANSFORMERS. They do not
//   constrain the validated value — a lowercase format still accepts
//   any string at the isType / typeErrors layer (the transform only
//   applies in a `format` pass, which this AOT port does not emit).
//   The aliases exist so consumer types stay aligned with mion and so
//   a future format-transform RT fn can pick the flags up unchanged.

import type {FormatString, StringParams} from './stringFormat.runtype.ts';

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type FormatAlpha<P extends StringParams = {}> = FormatString<P & {charClass: 'alpha'}>;
export type FormatAlphaNumeric<P extends StringParams = {}> = FormatString<P & {charClass: 'alphanumeric'}>;
export type FormatNumeric<P extends StringParams = {}> = FormatString<P & {charClass: 'numeric'}>;
export type FormatLowercase<P extends StringParams = {}> = FormatString<P & {lowercase: true}>;
export type FormatUppercase<P extends StringParams = {}> = FormatString<P & {uppercase: true}>;
export type FormatCapitalize<P extends StringParams = {}> = FormatString<P & {capitalize: true}>;
/* eslint-enable @typescript-eslint/no-empty-object-type */
