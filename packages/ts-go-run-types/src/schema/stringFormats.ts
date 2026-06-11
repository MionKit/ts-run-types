// Value-first PREDEFINED STRING-FORMAT builders — one builder per named string
// format alias (`email()` → `RunType<FormatEmail>`, `ipv4()`, `uuidv4()`,
// `stringDate({format: 'DD-MM-YYYY'})`, …). Sibling of atomic.ts's generic
// `string({…})` leaf: where `string()` carries an inline `FormatString<P>`, these
// carry the CONCRETE named alias from `../formats/…`, so the Go scanner reflects
// the SAME branded type off each builder's `InjectRunTypeData<…>` brand as the
// type-first `createValidate<FormatEmail>()` surface and the two converge on one
// structural id (no Go-side change — these resolve type-first already).
//
// Two builder shapes (mirroring atomic.ts):
//   • fixed presets (email / uuidv4 / ipv4 / domain / …) — no user params, so a
//     single no-arg overload via `presetBuilder`;
//   • parameterised families (alpha / stringDate / stringTime / stringDateTime) —
//     the no-params/plain ↔ params/branded two-overload split, like `string()`.
// The carrier `builderResult` returns is a fallback (discarded when the builder is
// nested in a composer, unused once the plugin injects the id), so its `type` tag
// is the Go format name purely for readability.

import {builderResult, lastInjectedId, presetBuilder} from './atomic.ts';
import {isInjectedData} from '../runtypes/registrar.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeData, CompTimeArgs} from '../markers.ts';
import type {
  StringParams,
  FormatAlpha,
  FormatAlphaNumeric,
  FormatNumeric,
  FormatLowercase,
  FormatUppercase,
  FormatCapitalize,
  FormatUUIDv4,
  FormatUUIDv7,
  FormatIP,
  FormatIPv4,
  FormatIPv6,
  FormatIPWithPort,
  FormatIPv4WithPort,
  FormatIPv6WithPort,
  FormatDomain,
  FormatDomainUnicode,
  FormatDomainPunycode,
  FormatDomainStrict,
  FormatEmail,
  FormatEmailPunycode,
  FormatEmailStrict,
  FormatUrl,
  FormatUrlHttp,
  FormatUrlFile,
} from '../formats/string/stringFormats.ts';
import type {
  FormatStringDate,
  FormatStringTime,
  FormatStringDateTime,
  FormatParams_Date,
  FormatParams_Time,
  FormatParams_DateTime,
} from '../formats/datetime/stringDateTimeFormats.ts';

// ───────────────────────── Char-class / transformers ────────────────

/** Alphabetic-only string (`FormatAlpha`); `alpha({maxLength: 3})` adds bounds. **/
export function alpha(id?: InjectRunTypeData<FormatAlpha>): RunType<FormatAlpha>;
export function alpha<const P extends StringParams>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeData<FormatAlpha<P>>
): RunType<FormatAlpha<P>>;
export function alpha(
  formatParamsOrId?: StringParams | InjectRunTypeData<FormatAlpha>,
  id?: InjectRunTypeData<FormatAlpha>
): RunType<FormatAlpha> {
  const formatParams = typeof formatParamsOrId === 'object' && !isInjectedData(formatParamsOrId) ? formatParamsOrId : {};
  const injectedId = lastInjectedId(formatParamsOrId, id);
  return builderResult(injectedId, {type: 'stringFormat', formatParams});
}

/** Alphanumeric-only string (`FormatAlphaNumeric`). **/
export const alphaNumeric = presetBuilder<FormatAlphaNumeric>('stringFormat');
/** Digits-only string (`FormatNumeric`). **/
export const numeric = presetBuilder<FormatNumeric>('stringFormat');
/** Lowercase string (`FormatLowercase`) — the transform applies only via
 *  `createFormatTransform`; validate validates it as a plain string. **/
export const lowercase = presetBuilder<FormatLowercase>('stringFormat');
/** Uppercase string (`FormatUppercase`). **/
export const uppercase = presetBuilder<FormatUppercase>('stringFormat');
/** Capitalized string (`FormatCapitalize`). **/
export const capitalize = presetBuilder<FormatCapitalize>('stringFormat');

// ──────────────────────────────── UUID ──────────────────────────────

/** UUID v4 (`FormatUUIDv4`). **/
export const uuidv4 = presetBuilder<FormatUUIDv4>('uuid');
/** UUID v7 (`FormatUUIDv7`). **/
export const uuidv7 = presetBuilder<FormatUUIDv7>('uuid');

// ───────────────────────────────── IP ───────────────────────────────

/** IP address, any version with localhost (`FormatIP`). **/
export const ip = presetBuilder<FormatIP>('ip');
/** IPv4 (`FormatIPv4`). **/
export const ipv4 = presetBuilder<FormatIPv4>('ip');
/** IPv6 (`FormatIPv6`). **/
export const ipv6 = presetBuilder<FormatIPv6>('ip');
/** IP (any) with port (`FormatIPWithPort`). **/
export const ipWithPort = presetBuilder<FormatIPWithPort>('ip');
/** IPv4 with port (`FormatIPv4WithPort`). **/
export const ipv4WithPort = presetBuilder<FormatIPv4WithPort>('ip');
/** IPv6 with port (`FormatIPv6WithPort`). **/
export const ipv6WithPort = presetBuilder<FormatIPv6WithPort>('ip');

// ──────────────────────────────── Domain ────────────────────────────

/** Domain name (`FormatDomain`). **/
export const domain = presetBuilder<FormatDomain>('domain');
/** Unicode domain (`FormatDomainUnicode`). **/
export const domainUnicode = presetBuilder<FormatDomainUnicode>('domain');
/** Punycode domain (`FormatDomainPunycode`). **/
export const domainPunycode = presetBuilder<FormatDomainPunycode>('domain');
/** Strict domain — ≤6 labels, ≥2 parts, alphabetical tld (`FormatDomainStrict`). **/
export const domainStrict = presetBuilder<FormatDomainStrict>('domain');

// ──────────────────────────────── Email ─────────────────────────────

/** Email (`FormatEmail`). **/
export const email = presetBuilder<FormatEmail>('email');
/** Punycode-domain email (`FormatEmailPunycode`). **/
export const emailPunycode = presetBuilder<FormatEmailPunycode>('email');
/** Strict email — strict local part + strict domain (`FormatEmailStrict`). **/
export const emailStrict = presetBuilder<FormatEmailStrict>('email');

// ───────────────────────────────── URL ──────────────────────────────

/** URL (`FormatUrl`). **/
export const url = presetBuilder<FormatUrl>('url');
/** HTTP(S) URL (`FormatUrlHttp`). **/
export const urlHttp = presetBuilder<FormatUrlHttp>('url');
/** file:// URL (`FormatUrlFile`). **/
export const urlFile = presetBuilder<FormatUrlFile>('url');

// ────────────────────── String date / time / dateTime ───────────────

/** A string-date field (`FormatStringDate`); `stringDate({format: 'DD-MM-YYYY'})`
 *  picks the layout and may add min/max bounds. **/
export function stringDate(id?: InjectRunTypeData<FormatStringDate>): RunType<FormatStringDate>;
export function stringDate<const P extends Partial<FormatParams_Date>>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeData<FormatStringDate<P>>
): RunType<FormatStringDate<P>>;
export function stringDate(
  formatParamsOrId?: Partial<FormatParams_Date> | InjectRunTypeData<FormatStringDate>,
  id?: InjectRunTypeData<FormatStringDate>
): RunType<FormatStringDate> {
  const formatParams = typeof formatParamsOrId === 'object' && !isInjectedData(formatParamsOrId) ? formatParamsOrId : {};
  const injectedId = lastInjectedId(formatParamsOrId, id);
  return builderResult(injectedId, {type: 'date', formatParams});
}

/** A string-time field (`FormatStringTime`). **/
export function stringTime(id?: InjectRunTypeData<FormatStringTime>): RunType<FormatStringTime>;
export function stringTime<const P extends Partial<FormatParams_Time>>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeData<FormatStringTime<P>>
): RunType<FormatStringTime<P>>;
export function stringTime(
  formatParamsOrId?: Partial<FormatParams_Time> | InjectRunTypeData<FormatStringTime>,
  id?: InjectRunTypeData<FormatStringTime>
): RunType<FormatStringTime> {
  const formatParams = typeof formatParamsOrId === 'object' && !isInjectedData(formatParamsOrId) ? formatParamsOrId : {};
  const injectedId = lastInjectedId(formatParamsOrId, id);
  return builderResult(injectedId, {type: 'time', formatParams});
}

/** A string-dateTime field (`FormatStringDateTime`). **/
export function stringDateTime(id?: InjectRunTypeData<FormatStringDateTime>): RunType<FormatStringDateTime>;
export function stringDateTime<const P extends Partial<FormatParams_DateTime>>(
  formatParams: CompTimeArgs<P>,
  id?: InjectRunTypeData<FormatStringDateTime<P>>
): RunType<FormatStringDateTime<P>>;
export function stringDateTime(
  formatParamsOrId?: Partial<FormatParams_DateTime> | InjectRunTypeData<FormatStringDateTime>,
  id?: InjectRunTypeData<FormatStringDateTime>
): RunType<FormatStringDateTime> {
  const formatParams = typeof formatParamsOrId === 'object' && !isInjectedData(formatParamsOrId) ? formatParamsOrId : {};
  const injectedId = lastInjectedId(formatParamsOrId, id);
  return builderResult(injectedId, {type: 'dateTime', formatParams});
}
