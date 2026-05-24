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
