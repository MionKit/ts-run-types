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
  isCurrency?: boolean;
};
interface RTValidationError {
  path: (StrNumber | object)[];
  expected: string;
  format?: TypeFormatError;
}

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

export const pf_countEnumKeys = registerPureFnFactory('rt::countEnumKeys', function () {
  // Counts enumerable keys via for-in: no array allocation (beats
  // `Object.keys(obj).length` ~1.4x on V8) and the same enumeration semantics
  // the hasUnknownKeysFromArray scan uses. Backs the `runsAfterValidation`
  // key-count fast path — after validation an all-required object is clean
  // iff its key count equals the declared prop count.
  return function _countEnumKeys(obj: Record<StrNumber, any>): number {
    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for (const _key in obj) count++;
    return count;
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
