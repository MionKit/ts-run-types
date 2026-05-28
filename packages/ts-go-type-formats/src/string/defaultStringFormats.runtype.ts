// Default string formats — Alpha / AlphaNumeric / Numeric (char-class
// patterns) and the Lowercase / Uppercase / Capitalize transformers.
// Mirrors mion's defaultStringFormats.runtype.ts. All resolve to the
// 'stringFormat' format, handled by the registered StringRunTypeFormat
// + the Go stringFormatEmitter.
//
// Alpha / AlphaNumeric / Numeric are defined via TypeFormat directly
// (not FormatString) so their inline string-literal `pattern` — the
// .d.ts-safe encoding the built-ins must use — doesn't go through the
// public StringParams['pattern'] surface, which is registerFormatPattern
// (FormatPattern) only. Lowercase / Uppercase / Capitalize carry no
// pattern, so they stay FormatString aliases.

import {TypeFormat} from '@mionjs/ts-go-run-types';
import type {FormatString, StringParams} from './stringFormat.runtype.ts';

// Mirror mion's ALPHA_REGEX / ALPHANUMERIC_REGEX / NUMERIC_REGEX
// (unicode property escapes). Sources as string-literal types.
type ALPHA_SRC = '^[\\p{L}]+$';
type ALPHANUMERIC_SRC = '^[\\p{L}\\p{N}]+$';
type NUMERIC_SRC = '^[\\p{N}]+$';

/* eslint-disable @typescript-eslint/no-empty-object-type */
export type FormatAlpha<P extends StringParams = {}> = TypeFormat<
  string,
  'stringFormat',
  P & {pattern: {source: ALPHA_SRC; flags: 'u'}; mockSamples: ['abc', 'Hello', 'World']},
  never
>;
export type FormatAlphaNumeric<P extends StringParams = {}> = TypeFormat<
  string,
  'stringFormat',
  P & {pattern: {source: ALPHANUMERIC_SRC; flags: 'u'}; mockSamples: ['abc123', 'Test42', 'XYZ0']},
  never
>;
export type FormatNumeric<P extends StringParams = {}> = TypeFormat<
  string,
  'stringFormat',
  P & {pattern: {source: NUMERIC_SRC; flags: 'u'}; mockSamples: ['123', '007', '42']},
  never
>;
export type FormatLowercase<P extends StringParams = {}> = FormatString<P & {lowercase: true}>;
export type FormatUppercase<P extends StringParams = {}> = FormatString<P & {uppercase: true}>;
export type FormatCapitalize<P extends StringParams = {}> = FormatString<P & {capitalize: true}>;
/* eslint-enable @typescript-eslint/no-empty-object-type */
