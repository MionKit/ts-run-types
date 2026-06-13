/* ########
 * 2026 ma-jerez
 * Author: Ma-jerez
 * License: UNLICENSED - proprietary, see LICENSE
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {registerPureFnFactory} from './pureFn.ts';

// Slim local type aliases for the RT utils surface, kept here so this
// file stays dependency-free. Fully erased at runtime.
type StrNumber = string | number;
type TypeFormatError = {
  name: string;
  val: StrNumber | boolean | bigint | (StrNumber | boolean | bigint)[];
  formatPath: StrNumber[];
};
interface RTValidationError {
  path: (StrNumber | object)[];
  expected: string;
  format?: TypeFormatError;
}

export const pf_asJSONString = registerPureFnFactory('rt::asJSONString', function () {
  // @ts-expect-error 2867
  if (typeof Bun !== 'undefined') return JSON.stringify; // bun has a faster JSON.stringify
  // eslint-disable-next-line no-control-regex
  const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
  const MAX_SCAPE_TEST_LENGTH = 1000;
  return function _asJSONStringRegexOnly(str) {
    if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {
      return '"' + str + '"';
    } else {
      return JSON.stringify(str);
    }
  };
});

export const pf_getUnknownKeysFromArray = registerPureFnFactory('rt::getUnknownKeysFromArray', function () {
  const MAX_UNKNOWN_KEYS = 10;
  return function _getUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): StrNumber[] {
    const unknownKeys: StrNumber[] = [];
    for (const prop in obj) {
      let found = false;
      for (let j = 0; j < keys.length; j++) {
        if (keys[j] === prop) {
          found = true;
          break;
        }
      }
      if (!found) {
        unknownKeys.push(prop as string);
        if (unknownKeys.length >= MAX_UNKNOWN_KEYS) throw new Error('Too many unknown keys');
      }
    }
    return unknownKeys;
  };
});

export const pf_hasUnknownKeysFromArray = registerPureFnFactory('rt::hasUnknownKeysFromArray', function () {
  return function _hasUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): boolean {
    for (const prop in obj) {
      let found = false;
      for (let j = 0; j < keys.length; j++) {
        if (keys[j] === prop) {
          found = true;
          break;
        }
      }
      if (!found) return true;
    }
    return false;
  };
});

export const pf_newRunTypeErr = registerPureFnFactory('rt::newRunTypeErr', function () {
  return function _err(
    pλth: readonly StrNumber[],
    εrr: RTValidationError[],
    expected: string,
    accessPath?: readonly StrNumber[]
  ): void {
    const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
    const runTypeErr: RTValidationError = {expected, path};
    εrr.push(runTypeErr);
  };
});

export const pf_formatErr = registerPureFnFactory('rt::formatErr', function () {
  return function _formatErr(
    pλth: StrNumber[],
    εrr: RTValidationError[],
    expected: string,
    fmtName: string,
    paramName: string,
    paramVal: string | number | boolean | bigint,
    fmtPath: StrNumber[],
    accessPath?: StrNumber[],
    fmtAccessPath?: StrNumber[]
  ): void {
    const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
    const formatPath = fmtAccessPath?.length ? [...fmtPath, ...fmtAccessPath, paramName] : [...fmtPath, paramName];
    const format: TypeFormatError = {name: fmtName, formatPath: formatPath, val: paramVal};
    const runTypeErr: Required<RTValidationError> = {expected, path, format};
    εrr.push(runTypeErr);
  };
});

export const pf_safeIterableKey = registerPureFnFactory('rt::safeIterableKey', function () {
  // A Map/Set entry key sanitised to a PropertyKey (string | number | symbol),
  // so an error-path segment `{key: …}` is always a valid Standard Schema
  // PathSegment. string / number / symbol pass through unchanged; everything
  // else collapses to a representative string (never throws on exotic keys).
  return function _safeKey(value: any): PropertyKey {
    const type = typeof value;
    if (type === 'string' || type === 'number' || type === 'symbol') return value;
    if (type === 'boolean' || type === 'bigint') return String(value);
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    try {
      return String(value);
    } catch {
      return 'object';
    }
  };
});

/** @reflection never */
export const pf_sanitizeCompiledFn = registerPureFnFactory('rt::sanitizeCompiledFn', function () {
  const anonymousRegex = /^\s*function\s+anonymous\s*\(/;
  return function sanitizeCompiled(fnCode: string): string {
    if (anonymousRegex.test(fnCode)) {
      return fnCode.replace(anonymousRegex, 'function (');
    }
    return fnCode;
  };
});
