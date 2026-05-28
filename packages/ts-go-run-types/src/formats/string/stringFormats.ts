// Consolidated string-format TYPE aliases — the public type surface of
// every string format (FormatString, FormatUUIDv4, FormatStringDate,
// FormatDomain, FormatEmail, …). Mocking lives in `stringFormatMock.ts`
// (one switch keyed by format name) and validation is build-time on the
// Go side; this file is type-only + the brand wiring.
//
// `TypeFormat` IS imported as a value (not `import type`): the value-level
// import keeps each brand alias's reflection metadata reachable for tsgo
// (mion documents the same constraint).

import {TypeFormat} from '../../runtypes/typeFormat.ts';
import type {FormatPattern} from '../../runtypes/formatPattern.ts';
// Built-in regex patterns — value import so the format types below can
// reference them by `typeof`. The Go scanner recovers {source, flags,
// mockSamples} from each const's literal type. Defined + sample-validated
// in ./string-patterns.ts.
import {
  ALPHA_PATTERN,
  ALPHANUMERIC_PATTERN,
  NUMERIC_PATTERN,
  DOMAIN_PATTERN,
  DOMAIN_UNICODE_PATTERN,
  DOMAIN_PUNYCODE_PATTERN,
  DOMAIN_NAME_PATTERN,
  DOMAIN_TLD_PATTERN,
  EMAIL_PATTERN,
  EMAIL_PUNYCODE_PATTERN,
  URL_PATTERN,
  URL_HTTP_PATTERN,
  URL_FILE_PATTERN,
} from './string-patterns.ts';

// ─────────────────────────── StringFormat ───────────────────────────

// PatternParam — the regex a string format validates against, supplied
// via `registerFormatPattern(...)`:
//   const slug = registerFormatPattern({regexp: /^[a-z-]+$/, mockSamples: ['a-b']});
//   type Slug = FormatString<{pattern: typeof slug}>;
// (Built-ins encode their pattern as an inline `{source, flags}` literal
// — a published .d.ts can't carry a regex VALUE for `typeof` recovery.)
export type PatternParam = FormatPattern;

// Samples — canonical valid values for the mock generator: either an
// explicit list, or (for char-class params) a string of sample chars.
export type Samples = string | readonly string[];

// allowedChars: the value must consist entirely of `val`'s characters.
export interface AllowedCharsParam {
  val: string;
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples?: Samples;
}

// disallowedChars: the value must contain NONE of `val`'s characters. A
// negative constraint can't be reversed, so `mockSamples` is required.
export interface DisallowedCharsParam {
  val: string;
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples: string;
}

// allowedValues: the value must be exactly one of `val` (enum-like).
export interface AllowedValuesParam {
  val: readonly string[];
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples?: Samples;
}

// disallowedValues: the value must be none of `val`. mockSamples required.
export interface DisallowedValuesParam {
  val: readonly string[];
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples: Samples;
}

// StringParams — the wire-serialisable params shape for FormatString.
// Cross-param invariants are validated build-time in Go (FMT002).
export interface StringParams {
  maxLength?: number;
  minLength?: number;
  length?: number;
  pattern?: PatternParam;
  allowedChars?: AllowedCharsParam;
  disallowedChars?: DisallowedCharsParam;
  allowedValues?: AllowedValuesParam;
  disallowedValues?: DisallowedValuesParam;
  mockSamples?: readonly string[];
  // Transformer flags — applied only by the `createFormatTransform<T>`
  // RT-fn, NOT by isType / typeErrors validation.
  trim?: boolean;
  lowercase?: boolean;
  uppercase?: boolean;
  capitalize?: boolean;
}

// FormatString — the branded string alias users annotate with:
// `FormatString<{maxLength: 32}>`. `BrandName` produces a nominal type
// when needed (mion's convention).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatString<P extends StringParams = {}, BrandName extends string = never> = TypeFormat<
  string,
  'stringFormat',
  P,
  BrandName
>;

// Default string formats — Alpha / AlphaNumeric / Numeric (char-class
// patterns) and the Lowercase / Uppercase / Capitalize transformers.
// Alpha/AlphaNumeric/Numeric reference the registered char-class patterns
// by `typeof` (see ./string-patterns.ts).
/* eslint-disable @typescript-eslint/no-empty-object-type */
export type FormatAlpha<P extends StringParams = {}> = TypeFormat<
  string,
  'stringFormat',
  P & {pattern: typeof ALPHA_PATTERN},
  never
>;
export type FormatAlphaNumeric<P extends StringParams = {}> = TypeFormat<
  string,
  'stringFormat',
  P & {pattern: typeof ALPHANUMERIC_PATTERN},
  never
>;
export type FormatNumeric<P extends StringParams = {}> = TypeFormat<
  string,
  'stringFormat',
  P & {pattern: typeof NUMERIC_PATTERN},
  never
>;
export type FormatLowercase<P extends StringParams = {}> = FormatString<P & {lowercase: true}>;
export type FormatUppercase<P extends StringParams = {}> = FormatString<P & {uppercase: true}>;
export type FormatCapitalize<P extends StringParams = {}> = FormatString<P & {capitalize: true}>;
/* eslint-enable @typescript-eslint/no-empty-object-type */

// ─────────────────────────────── UUID ───────────────────────────────

export interface FormatParams_UUID {
  version: '4' | '7';
}
export type FormatUUIDv4 = TypeFormat<string, 'uuid', {version: '4'}, 'uuid'>;
export type FormatUUIDv7 = TypeFormat<string, 'uuid', {version: '7'}, 'uuid'>;

// ─────────────────────────────── Date ───────────────────────────────

export type DateFmt = 'ISO' | 'YYYY-MM-DD' | 'DD-MM-YYYY' | 'MM-DD-YYYY' | 'YYYY-MM' | 'MM-DD' | 'DD-MM';
export interface FormatParams_Date {
  format: DateFmt;
}
export type DEFAULT_DATE_PARAMS = {format: 'ISO'};
export type FormatStringDate<P extends Partial<FormatParams_Date> = DEFAULT_DATE_PARAMS> = TypeFormat<string, 'date', P, 'date'>;

// ─────────────────────────────── Time ───────────────────────────────

export type TimeFmt = 'ISO' | 'HH:mm:ss[.mmm]TZ' | 'HH:mm:ss[.mmm]' | 'HH:mm:ss' | 'HH:mm' | 'mm:ss' | 'HH' | 'mm' | 'ss';
export interface FormatParams_Time {
  format: TimeFmt;
}
export type DEFAULT_TIME_FORMAT_PARAMS = {format: 'ISO'};
export type FormatStringTime<P extends Partial<FormatParams_Time> = DEFAULT_TIME_FORMAT_PARAMS> = TypeFormat<
  string,
  'time',
  P,
  'time'
>;

// ───────────────────────────── DateTime ─────────────────────────────

export interface FormatParams_DateTime {
  date: FormatParams_Date;
  time: FormatParams_Time;
  splitChar: string;
}
export type DEFAULT_DATE_TIME_PARAMS = {
  date: {format: 'ISO'};
  time: {format: 'ISO'};
  splitChar: 'T';
};
// P is passed through verbatim (NOT intersected with defaults — that
// would collapse overridden `format` literals to `never`); the Go side
// defaults missing nested formats / splitChar to ISO / 'T'.
export type FormatStringDateTime<P extends Partial<FormatParams_DateTime> = DEFAULT_DATE_TIME_PARAMS> = TypeFormat<
  string,
  'dateTime',
  P,
  'dateTime'
>;

// ──────────────────────────────── IP ────────────────────────────────

export interface FormatParams_IP {
  version: 4 | 6 | 'any';
  allowLocalHost?: boolean;
  allowPort?: boolean;
}
type DEFAULT_IP_PARAMS = {version: 'any'; allowLocalHost: true};
export type FormatIP<P extends FormatParams_IP = DEFAULT_IP_PARAMS> = TypeFormat<string, 'ip', P, 'ip'>;
export type FormatIPv4 = FormatIP<{version: 4; allowLocalHost: true}>;
export type FormatIPv6 = FormatIP<{version: 6; allowLocalHost: true}>;
export type FormatIPWithPort = FormatIP<{version: 'any'; allowLocalHost: true; allowPort: true}>;
export type FormatIPv4WithPort = FormatIP<{version: 4; allowLocalHost: true; allowPort: true}>;
export type FormatIPv6WithPort = FormatIP<{version: 6; allowLocalHost: true; allowPort: true}>;

// ────────────────────────────── Domain ──────────────────────────────

// DomainPartParams — the sub-validators a `names` label or the `tld`
// accepts (mion's Omit<StringValidators, 'length'|'allowedChars'|'disallowedChars'>).
export interface DomainPartParams {
  maxLength?: number;
  minLength?: number;
  pattern?: PatternParam | {source: string; flags?: string};
  allowedValues?: AllowedValuesParam;
  disallowedValues?: DisallowedValuesParam;
  mockSamples?: Samples;
}

// FormatParams_Domain — pattern path (single baked regex) OR names+tld
// decomposition, never both (Go FMT002 enforces it).
export interface FormatParams_Domain {
  maxLength?: number;
  minLength?: number;
  maxParts?: number;
  minParts?: number;
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
  names?: DomainPartParams;
  tld?: DomainPartParams;
}

export type FormatDomain = TypeFormat<string, 'domain', {pattern: typeof DOMAIN_PATTERN; maxLength: 253; minLength: 5}, 'domain'>;
export type FormatDomainUnicode = TypeFormat<
  string,
  'domain',
  {pattern: typeof DOMAIN_UNICODE_PATTERN; maxLength: 253; minLength: 5},
  'domain'
>;
export type FormatDomainPunycode = TypeFormat<
  string,
  'domain',
  {pattern: typeof DOMAIN_PUNYCODE_PATTERN; maxLength: 253; minLength: 5},
  'domain'
>;

export type DEFAULT_STRICT_DOMAIN_PARAMS = {
  maxParts: 6;
  minParts: 2;
  maxLength: 253;
  minLength: 5;
  names: {maxLength: 63; minLength: 2; pattern: typeof DOMAIN_NAME_PATTERN};
  tld: {maxLength: 12; minLength: 2; pattern: typeof DOMAIN_TLD_PATTERN};
};
// FormatDomainStrict — ≤6 labels, ≥2 parts, no hyphen-edge labels,
// alphabetical tld.
export type FormatDomainStrict = TypeFormat<string, 'domain', DEFAULT_STRICT_DOMAIN_PARAMS, 'domain'>;

// ─────────────────────────────── Email ──────────────────────────────

// FormatParams_Email — pattern path, or localPart + domain decomposition.
export interface FormatParams_Email {
  maxLength?: number;
  minLength?: number;
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
  localPart?: StringParams;
  domain?: FormatParams_Domain;
}

export type FormatEmail = TypeFormat<string, 'email', {pattern: typeof EMAIL_PATTERN; maxLength: 254; minLength: 7}, 'email'>;
export type FormatEmailPunycode = TypeFormat<
  string,
  'email',
  {pattern: typeof EMAIL_PUNYCODE_PATTERN; maxLength: 254; minLength: 7},
  'email'
>;

export type DEFAULT_STRICT_EMAIL_PARAMS = {
  maxLength: 254;
  localPart: {
    maxLength: 64;
    minLength: 1;
    disallowedChars: {
      val: ' ()<>[]:;\\,{}|+@';
      errorMessage: 'Invalid characters in email local part';
      mockSamples: 'abcdefghijklmnopqrstuvwxyz0123456789._-';
    };
  };
  domain: DEFAULT_STRICT_DOMAIN_PARAMS;
};
// FormatEmailStrict — split on the last '@'; local part rejects spaces /
// brackets / aliasing chars; domain validated strictly.
export type FormatEmailStrict = TypeFormat<string, 'email', DEFAULT_STRICT_EMAIL_PARAMS, 'email'>;

// ──────────────────────────────── URL ───────────────────────────────

export interface FormatParams_Url {
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
}

export type FormatUrl = TypeFormat<string, 'url', {pattern: typeof URL_PATTERN; maxLength: 2048}, 'url'>;
export type FormatUrlHttp = TypeFormat<string, 'url', {pattern: typeof URL_HTTP_PATTERN; maxLength: 2048}, 'url'>;
export type FormatUrlFile = TypeFormat<string, 'url', {pattern: typeof URL_FILE_PATTERN; maxLength: 2048}, 'url'>;
