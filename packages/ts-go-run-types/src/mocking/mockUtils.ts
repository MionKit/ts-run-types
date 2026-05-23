// Atomic value generators ported verbatim from mion's
// mocking/mockUtils.ts. Every random value the walker produces bottoms
// out in one of these helpers, so generator quality is identical to
// mion's. Keep changes in lockstep with the upstream file.

import {anyValuesList, stringCharSet, mockRegExpsList} from './constants.mock.ts';

/** Random integer in `[min, max]` (inclusive on both ends). **/
export function random(min: number = 0, max: number = 10000): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Pick a random item from a non-empty array. **/
export function randomItem<T>(list: T[]): T {
  return list[random(0, list.length - 1)];
}

export function mockBoolean(): boolean {
  return Math.random() < 0.5;
}

export function mockBigInt(min: number = 0, max: number = 10000): bigint {
  return BigInt(random(min, max));
}

export function mockNumber(min: number = 0, max: number = 10000): number {
  if (min > max) throw new Error('min cannot be greater than max');
  return random(min, max);
}

/** Random string of `length` chars drawn from `allowedChars` minus any
 *  chars in `disallowedChars`. **/
export function mockString(
  length: number = random(0, 30),
  allowedChars: string = stringCharSet,
  disallowedChars: string = ''
): string {
  if (allowedChars.length === 0) throw new Error('Can not generate random string as allowedChars cannot be empty');
  const allowedCharSet = allowedChars
    .split('')
    .filter((char) => !disallowedChars.includes(char))
    .join('');
  if (allowedCharSet.length === 0)
    throw new Error('Can not generate random string as allowedChars and disallowedChars are mutually exclusive');
  return Array.from({length}, () => allowedCharSet[random(0, allowedCharSet.length - 1)]).join('');
}

export function mockSymbol(name?: string, length?: number, charsSet?: string): symbol {
  const symbolName = name ?? mockString(length, charsSet);
  return Symbol(symbolName);
}

export function mockRegExp(list: RegExp[] = mockRegExpsList): RegExp {
  return list[random(0, list.length - 1)];
}

/** Random date in `[minDate, maxDate]` (inclusive). Either bound may be
 *  a `Date` or a numeric timestamp. **/
export function mockDate(minDate: Date | number = new Date(0), maxDate: Date | number = new Date()): Date {
  const min = typeof minDate === 'number' ? minDate : minDate.getTime();
  const max = typeof maxDate === 'number' ? maxDate : maxDate.getTime();
  if (min > max) throw new Error('minDate cannot be greater than maxDate');
  return new Date(random(min, max));
}

export function mockAny(anyList: unknown[] = anyValuesList): unknown {
  return anyList[random(0, anyList.length - 1)];
}
