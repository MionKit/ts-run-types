// Registration module for every pure fn the Go-side format emitters
// reach via `utl.getPureFn('mionFormats::<name>')`. Each cpf_* below
// is registered at module load; importing this file from
// `src/index.ts` (which is the package's public surface) is enough
// to guarantee the registrations happen before any user code
// references a format type.
//
// Mirrors mion's `packages/type-formats/src/type-formats-pure-fns.ts`
// minus the deepkit-coupled `getPureFn` typing — our utl is the
// runtime helper exported from @mionjs/ts-go-run-types.
//
// Phase 3 ships cpf_isUUID. Subsequent phases append more.

import {registerPureFnFactory, type RTUtils} from '@mionjs/ts-go-run-types';

// FormatParams_UUID — the wire-shape params object the Go emitter
// passes to cpf_isUUID at runtime. Mirrors mion's FormatParams_UUID
// keeping only what the validator needs.
interface FormatParams_UUID {
  version: string;
}

// is_date_string is the shape the base cpf_isDateString resolves to.
// Used to type the getPureFn() lookups in the format-wrapper
// factories below.
type IsDateStringFn = (year: string | undefined, month: string, day?: string) => boolean;

// cpf_isUUID — port of mion's same-named pure fn. Length + dash
// positions + version digit at slot 14 + hex character class on
// every other slot. Matches the runtime behaviour of the canonical
// UUIDv4 / UUIDv7 patterns without pulling in a regex engine.
export const cpf_isUUID = registerPureFnFactory('mionFormats', 'isUUID', function () {
  return function _isUUID(value: string, params: FormatParams_UUID): boolean {
    if (typeof value !== 'string' || value.length !== 36) return false;
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) {
        if (value[i] !== '-') return false;
      } else if (i === 14) {
        if (value[i] !== params.version) return false;
      } else {
        const charCode = value.charCodeAt(i);
        const is09 = charCode >= 48 && charCode <= 57;
        const isaf = charCode >= 97 && charCode <= 102;
        const isAF = charCode >= 65 && charCode <= 70;
        if (!(is09 || isaf || isAF)) return false;
      }
    }
    return true;
  };
});

// ############### Date pure fns ###############
//
// cpf_isDateString is the base leap-year-aware validator; the six
// format-specific wrappers split the input on '-' and delegate. The
// wrappers reach the base fn via `utl.getPureFn('mionFormats::isDateString')`
// — the Go-side pure-fn extractor records that as a transitive
// dependency so the base fn ships in the cache alongside the wrapper.

export const cpf_isDateString = registerPureFnFactory('mionFormats', 'isDateString', function () {
  return function _isDateString(year: string | undefined, month: string, day?: string): boolean {
    let y: number | undefined;
    if (year) {
      if (year.length !== 4) return false;
      y = Number(year);
      if (isNaN(y) || y < 0 || y > 9999) return false;
    }
    if (month.length !== 2) return false;
    const m = Number(month);
    if (isNaN(m) || m < 1 || m > 12) return false;
    if (day) {
      if (day.length !== 2) return false;
      const d = Number(day);
      if (isNaN(d) || d < 1 || d > 31) return false;
      if (m === 2) {
        if (d > 29) return false;
        if (y && d === 29 && !(y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0))) return false;
      } else if ((m === 4 || m === 6 || m === 9 || m === 11) && d > 30) {
        return false;
      }
    }
    return true;
  };
});

export const cpf_isDateString_YMD = registerPureFnFactory('mionFormats', 'isDateString_YMD', function (utl: RTUtils) {
  const isDate = utl.getPureFn('mionFormats::isDateString') as IsDateStringFn;
  return function _is_ymd(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 3 && isDate(parts[0], parts[1], parts[2]);
  };
});

export const cpf_isDateString_DMY = registerPureFnFactory('mionFormats', 'isDateString_DMY', function (utl: RTUtils) {
  const isDate = utl.getPureFn('mionFormats::isDateString') as IsDateStringFn;
  return function _is_dmy(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 3 && isDate(parts[2], parts[1], parts[0]);
  };
});

export const cpf_isDateString_MDY = registerPureFnFactory('mionFormats', 'isDateString_MDY', function (utl: RTUtils) {
  const isDate = utl.getPureFn('mionFormats::isDateString') as IsDateStringFn;
  return function _is_mdy(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 3 && isDate(parts[2], parts[0], parts[1]);
  };
});

export const cpf_isDateString_YM = registerPureFnFactory('mionFormats', 'isDateString_YM', function (utl: RTUtils) {
  const isDate = utl.getPureFn('mionFormats::isDateString') as IsDateStringFn;
  return function _is_ym(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 2 && isDate(parts[0], parts[1]);
  };
});

export const cpf_isDateString_MD = registerPureFnFactory('mionFormats', 'isDateString_MD', function (utl: RTUtils) {
  const isDate = utl.getPureFn('mionFormats::isDateString') as IsDateStringFn;
  return function _is_md(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 2 && isDate(undefined, parts[0], parts[1]);
  };
});

export const cpf_isDateString_DM = registerPureFnFactory('mionFormats', 'isDateString_DM', function (utl: RTUtils) {
  const isDate = utl.getPureFn('mionFormats::isDateString') as IsDateStringFn;
  return function _is_dm(value: string): boolean {
    const parts = value.split('-');
    return parts.length === 2 && isDate(undefined, parts[1], parts[0]);
  };
});

// ############### Time pure fns ###############
//
// Leaf validators (isHours / isMinutes / isSeconds) validate a single
// numeric segment. The composite validators build up from there:
// isSecondsWithMs → isSeconds; isTimeZone → isHours+isMinutes;
// isTimeString_ISO → isHours+isMinutes+isSecondsWithMs;
// isTimeString_ISO_TZ → isTimeString_ISO+isTimeZone; etc. Each
// dependency is reached via utl.getPureFn so the Go extractor records
// the full transitive graph.

type SegmentFn = (segment: string) => boolean;

export const cpf_isHours = registerPureFnFactory('mionFormats', 'isHours', function () {
  return function _is_h(hours: string): boolean {
    if (!hours.length || hours.length > 2) return false;
    const n = Number(hours);
    if (isNaN(n)) return false;
    return n >= 0 && n <= 23;
  };
});

export const cpf_isMinutes = registerPureFnFactory('mionFormats', 'isMinutes', function () {
  return function _is_m(mins: string): boolean {
    if (!mins.length || mins.length > 2) return false;
    const n = Number(mins);
    if (isNaN(n)) return false;
    return n >= 0 && n <= 59;
  };
});

export const cpf_isSeconds = registerPureFnFactory('mionFormats', 'isSeconds', function () {
  return function _is_s(secs: string): boolean {
    if (!secs.length || secs.length > 2) return false;
    const n = Number(secs);
    if (isNaN(n)) return false;
    return n >= 0 && n <= 59;
  };
});

export const cpf_isSecondsWithMs = registerPureFnFactory('mionFormats', 'isSecondsWithMs', function (utl: RTUtils) {
  const isS = utl.getPureFn('mionFormats::isSeconds') as SegmentFn;
  return function _is_s_ms(secsAndMs: string): boolean {
    const parts = secsAndMs.split('.');
    if (parts.length > 2) return false;
    if (!isS(parts[0])) return false;
    const ms = parts[1];
    if (ms) {
      if (ms.length !== 3) return false;
      const n = Number(ms);
      if (isNaN(n) || n < 0 || n > 999) return false;
    }
    return true;
  };
});

export const cpf_isTimeZone = registerPureFnFactory('mionFormats', 'isTimeZone', function (utl: RTUtils) {
  const isH = utl.getPureFn('mionFormats::isHours') as SegmentFn;
  const isM = utl.getPureFn('mionFormats::isMinutes') as SegmentFn;
  return function _is_tz(timeZone: string): boolean {
    if (timeZone === 'Z' || timeZone === 'z') return true;
    const parts = timeZone.split(':');
    return parts.length === 2 && isH(parts[0]) && isM(parts[1]);
  };
});

export const cpf_isTimeString_ISO = registerPureFnFactory('mionFormats', 'isTimeString_ISO', function (utl: RTUtils) {
  const isH = utl.getPureFn('mionFormats::isHours') as SegmentFn;
  const isM = utl.getPureFn('mionFormats::isMinutes') as SegmentFn;
  const isSms = utl.getPureFn('mionFormats::isSecondsWithMs') as SegmentFn;
  return function _is_iso(value: string): boolean {
    const parts = value.split(':');
    return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isSms(parts[2]);
  };
});

export const cpf_isTimeString_ISO_TZ = registerPureFnFactory('mionFormats', 'isTimeString_ISO_TZ', function (utl: RTUtils) {
  const isTime = utl.getPureFn('mionFormats::isTimeString_ISO') as SegmentFn;
  const isTZ = utl.getPureFn('mionFormats::isTimeZone') as SegmentFn;
  return function _is_iso_tz(value: string): boolean {
    const isZ = value.endsWith('Z') || value.endsWith('z');
    const isPositiveTZ = isZ || value.indexOf('+') !== -1;
    const isNegativeTZ = isZ || value.indexOf('-') !== -1;
    if (!isZ && !isPositiveTZ && !isNegativeTZ) return false;
    const timeAndTz = isZ
      ? [value.substring(0, value.length - 1), 'Z']
      : value.split(isPositiveTZ ? '+' : '-');
    if (timeAndTz.length !== 2) return false;
    return isTime(timeAndTz[0]) && isTZ(timeAndTz[1]);
  };
});

export const cpf_isTimeString_HHmmss = registerPureFnFactory('mionFormats', 'isTimeString_HHmmss', function (utl: RTUtils) {
  const isH = utl.getPureFn('mionFormats::isHours') as SegmentFn;
  const isM = utl.getPureFn('mionFormats::isMinutes') as SegmentFn;
  const isS = utl.getPureFn('mionFormats::isSeconds') as SegmentFn;
  return function _is_hhmmss(value: string): boolean {
    const parts = value.split(':');
    return parts.length === 3 && isH(parts[0]) && isM(parts[1]) && isS(parts[2]);
  };
});

export const cpf_isTimeString_HHmm = registerPureFnFactory('mionFormats', 'isTimeString_HHmm', function (utl: RTUtils) {
  const isH = utl.getPureFn('mionFormats::isHours') as SegmentFn;
  const isM = utl.getPureFn('mionFormats::isMinutes') as SegmentFn;
  return function _is_hhmm(value: string): boolean {
    const parts = value.split(':');
    return parts.length === 2 && isH(parts[0]) && isM(parts[1]);
  };
});

export const cpf_isTimeString_mmss = registerPureFnFactory('mionFormats', 'isTimeString_mmss', function (utl: RTUtils) {
  const isM = utl.getPureFn('mionFormats::isMinutes') as SegmentFn;
  const isS = utl.getPureFn('mionFormats::isSeconds') as SegmentFn;
  return function _is_mmss(value: string): boolean {
    const parts = value.split(':');
    return parts.length === 2 && isM(parts[0]) && isS(parts[1]);
  };
});

// ############### IP pure fns ###############
//
// isIPV4 / isIPV6 accept a params object carrying the version (for the
// localhost check), allowLocalHost, and allowPort flags. Both delegate
// the loopback test to isLocalHost.

interface FormatParams_IP {
  version: 4 | 6 | 'any';
  allowLocalHost?: boolean;
  allowPort?: boolean;
}

type IsIpFn = (ip: string, params: FormatParams_IP) => boolean;

export const cpf_isLocalHost = registerPureFnFactory('mionFormats', 'isLocalHost', function () {
  const lhr = /^localhost$/i;
  return function _is_local_host(ip: string, params: FormatParams_IP): boolean {
    if (params.version === 4) return lhr.test(ip) || ip === '127:0:0:1';
    if (params.version === 6) return ip === '::1' || ip === '0:0:0:0:0:0:0:1';
    return lhr.test(ip) || ip === '127:0:0:1' || ip === '::1' || ip === '0:0:0:0:0:0:0:1';
  };
});

export const cpf_isIPV4 = registerPureFnFactory('mionFormats', 'isIPV4', function (utl: RTUtils) {
  const isLocalHost = utl.getPureFn('mionFormats::isLocalHost') as IsIpFn;
  function getAddress(ip: string, params: FormatParams_IP): false | string {
    if (!params.allowPort) return ip;
    const parts = ip.split(':');
    if (parts.length > 2) return false;
    const [address, portS] = parts;
    if (!portS) return address;
    const port = Number(portS);
    if (isNaN(port) || port < 0 || port > 65535) return false;
    return address;
  }
  return function _is_ip_v4(ip: string, params: FormatParams_IP): boolean {
    const address = getAddress(ip, params);
    if (address === false) return false;
    const isLocal = isLocalHost(address, params);
    if (params.allowLocalHost && isLocal) return true;
    if (!params.allowLocalHost && isLocal) return false;
    const sections = address.split('.');
    if (sections.length !== 4) return false;
    for (const section of sections) {
      const num = Number(section);
      if (isNaN(num) || num < 0 || num > 255) return false;
    }
    return true;
  };
});

export const cpf_isIPV6 = registerPureFnFactory('mionFormats', 'isIPV6', function (utl: RTUtils) {
  const isLocalHost = utl.getPureFn('mionFormats::isLocalHost') as IsIpFn;
  const ipv6PortRegexp = /^\[([^\]]+)\](?::(\d+))?$/;
  function getAddress(ip: string, params: FormatParams_IP): false | string {
    if (!params.allowPort) return ip;
    const match = ip.match(ipv6PortRegexp);
    if (!match) return false;
    const address = match[1];
    const port = match[2];
    if (!port) return address;
    const num = Number(port);
    if (isNaN(num) || num < 0 || num > 65535) return false;
    return address;
  }
  return function _is_ip_v6(ip: string, params: FormatParams_IP): boolean {
    const address = getAddress(ip, params);
    if (address === false) return false;
    const isLocal = isLocalHost(address, params);
    if (params.allowLocalHost && isLocal) return true;
    if (!params.allowLocalHost && isLocal) return false;
    const sections = address.split(':');
    if (sections.length < 3 || sections.length > 8) return false;
    let doubleColon = 0;
    for (const section of sections) {
      if (section.length === 0) {
        doubleColon++;
        if (doubleColon > 1) return false;
        continue;
      }
      if (section.length > 4) return false;
      const num = parseInt(section, 16);
      if (isNaN(num) || num < 0 || num > 0xffff) return false;
    }
    return true;
  };
});

// ############### Domain pure fns ###############
//
// AOT divergence from mion: mion passes a raw RegExp in params.pattern,
// which can't survive a TS-type → wire-protocol round-trip (there are
// no regex literals at the type level). Instead the variant is selected
// by a string param and the matching regex is baked into the pure fn.
// The three variants mirror mion's DOMAIN_PATTERN / *_UNICODE /
// *_PUNYCODE. Length + part-count constraints layer on top.

interface FormatParams_Domain {
  variant?: 'standard' | 'unicode' | 'punycode';
  maxLength?: number;
  minLength?: number;
  maxParts?: number;
  minParts?: number;
}

export const cpf_isDomain = registerPureFnFactory('mionFormats', 'isDomain', function () {
  const STANDARD = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/;
  const UNICODE = /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[a-zA-Z]{2,63}$/u;
  const PUNYCODE = /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9-]{2,63}$/;
  return function _is_domain(value: string, params: FormatParams_Domain): boolean {
    if (typeof value !== 'string') return false;
    const maxLength = params.maxLength ?? 253;
    const minLength = params.minLength ?? 5;
    if (value.length > maxLength || value.length < minLength) return false;
    const regexp = params.variant === 'unicode' ? UNICODE : params.variant === 'punycode' ? PUNYCODE : STANDARD;
    if (!regexp.test(value)) return false;
    if (params.maxParts !== undefined || params.minParts !== undefined) {
      const parts = value.split('.').length;
      if (params.maxParts !== undefined && parts > params.maxParts) return false;
      if (params.minParts !== undefined && parts < params.minParts) return false;
    }
    return true;
  };
});

// ############### Email pure fns ###############
//
// Same AOT divergence as domain: variant selects a baked-in regex
// rather than carrying a raw RegExp. 'standard' mirrors mion's
// EMAIL_PATTERN, 'punycode' its EMAIL_PATTERN_PUNYCODE. Length bounds
// (default 7..254) layer on top.

interface FormatParams_Email {
  variant?: 'standard' | 'punycode';
  maxLength?: number;
  minLength?: number;
}

export const cpf_isEmail = registerPureFnFactory('mionFormats', 'isEmail', function () {
  const STANDARD = /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/;
  const PUNYCODE = /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z0-9-]{2,63}$/;
  return function _is_email(value: string, params: FormatParams_Email): boolean {
    if (typeof value !== 'string') return false;
    const maxLength = params.maxLength ?? 254;
    const minLength = params.minLength ?? 7;
    if (value.length > maxLength || value.length < minLength) return false;
    const regexp = params.variant === 'punycode' ? PUNYCODE : STANDARD;
    return regexp.test(value);
  };
});
