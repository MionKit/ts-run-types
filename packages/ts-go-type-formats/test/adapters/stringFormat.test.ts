// FormatString end-to-end adapter test. Each scenario constructs a
// validator via `createIsType<FormatString<P>>()`, exercises the
// valid/invalid sample sets, and the error-collector via
// `createGetTypeErrors<FormatString<P>>()`.
//
// The vite-plugin-runtypes wires the Go binary in via this package's
// vitest.config.ts — when the plugin sees these call sites it
// rewrites them with the resolved RT hash and emits the cache
// modules. The format-emit hook in internal/compiled/typefns/istype.go
// looks up the registered stringFormatEmitter and splices the
// length-bound predicates into the validator body.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {FormatString} from '@mionjs/ts-go-type-formats';
// Side-effect: registers the StringRunTypeFormat with the runtime
// formatRegistry. Direct import of the .runtype.ts module guarantees
// load-order regardless of test-runner caching.
import '../../src/index.ts';

describe('FormatString — length constraints', () => {
  it('maxLength accepts strings up to the bound and rejects longer ones', () => {
    const isShort = createIsType<FormatString<{maxLength: 5}>>();
    expect(isShort('')).toBe(true);
    expect(isShort('hello')).toBe(true);
    expect(isShort('hello!')).toBe(false);
    expect(isShort(42 as unknown as string)).toBe(false);
  });

  it('minLength accepts strings meeting the bound and rejects shorter ones', () => {
    const isAtLeastThree = createIsType<FormatString<{minLength: 3}>>();
    expect(isAtLeastThree('abc')).toBe(true);
    expect(isAtLeastThree('abcd')).toBe(true);
    expect(isAtLeastThree('ab')).toBe(false);
    expect(isAtLeastThree('')).toBe(false);
  });

  it('length accepts exactly-N strings and rejects every other length', () => {
    const isExactlyFour = createIsType<FormatString<{length: 4}>>();
    expect(isExactlyFour('abcd')).toBe(true);
    expect(isExactlyFour('abc')).toBe(false);
    expect(isExactlyFour('abcde')).toBe(false);
  });

  it('combining maxLength + minLength bounds both ends', () => {
    const isInRange = createIsType<FormatString<{minLength: 2; maxLength: 4}>>();
    expect(isInRange('a')).toBe(false);
    expect(isInRange('ab')).toBe(true);
    expect(isInRange('abcd')).toBe(true);
    expect(isInRange('abcde')).toBe(false);
  });
});

describe('FormatString — typeErrors diagnostics', () => {
  it('maxLength violation pushes a TypeFormatError with the bound', () => {
    const collect = createGetTypeErrors<FormatString<{maxLength: 3}>>();
    const errors = collect('toolong');
    expect(errors.length).toBeGreaterThan(0);
    const formatErr = errors.find((entry) => entry.format?.name === 'stringFormat')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe(3);
  });

  it('valid input yields no errors', () => {
    const collect = createGetTypeErrors<FormatString<{maxLength: 3}>>();
    expect(collect('ok')).toEqual([]);
    expect(collect('abc')).toEqual([]);
  });
});

describe('FormatString — allowedChars', () => {
  it('accepts strings built only from the allowed set, rejects others', () => {
    const isHex = createIsType<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>();
    expect(isHex('deadbeef')).toBe(true);
    expect(isHex('0042')).toBe(true);
    expect(isHex('xyz')).toBe(false);
    expect(isHex('dead beef')).toBe(false); // space not allowed
    expect(isHex('')).toBe(false); // ^[...]+$ requires at least one char
  });

  it('ignoreCase folds case in the allowed set', () => {
    const isAbc = createIsType<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>();
    expect(isAbc('ABC')).toBe(true);
    expect(isAbc('aAbBcC')).toBe(true);
    expect(isAbc('abcd')).toBe(false);
  });

  it('treats regex-special chars in the set as literals', () => {
    const isDotDash = createIsType<FormatString<{allowedChars: {val: '.-'}}>>();
    expect(isDotDash('...---')).toBe(true);
    expect(isDotDash('a')).toBe(false); // a is not '.' or '-'
  });
});

describe('FormatString — disallowedChars', () => {
  it('rejects strings containing any disallowed char', () => {
    const noSymbols = createIsType<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>();
    expect(noSymbols('hello')).toBe(true);
    expect(noSymbols('hi!')).toBe(false);
    expect(noSymbols('a@b')).toBe(false);
  });
});

describe('FormatString — allowedValues (enum-like)', () => {
  it('accepts only the listed values', () => {
    const isColor = createIsType<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>();
    expect(isColor('red')).toBe(true);
    expect(isColor('blue')).toBe(true);
    expect(isColor('yellow')).toBe(false);
    expect(isColor('RED')).toBe(false); // case-sensitive by default
    expect(isColor('redgreen')).toBe(false); // exact match, anchored
  });

  it('ignoreCase folds case across the value set', () => {
    const isColor = createIsType<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>();
    expect(isColor('RED')).toBe(true);
    expect(isColor('Green')).toBe(true);
    expect(isColor('blue')).toBe(false);
  });

  it('escapes regex-special chars in values (exact literal match)', () => {
    const isToken = createIsType<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>();
    expect(isToken('a.b')).toBe(true);
    expect(isToken('c+d')).toBe(true);
    expect(isToken('axb')).toBe(false); // '.' is literal, not "any char"
    expect(isToken('ccd')).toBe(false); // '+' is literal, not "one or more"
  });
});

describe('FormatString — disallowedValues', () => {
  it('rejects the listed values, accepts everything else', () => {
    const notReserved = createIsType<
      FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>
    >();
    expect(notReserved('alice')).toBe(true);
    expect(notReserved('admin')).toBe(false);
    expect(notReserved('root')).toBe(false);
  });
});

describe('FormatString — custom errorMessage in typeErrors', () => {
  it('allowedValues default message', () => {
    const collect = createGetTypeErrors<FormatString<{allowedValues: {val: ['a', 'b']}}>>();
    const formatErr = collect('c').find((entry) => entry.format?.name === 'stringFormat')?.format;
    expect(formatErr?.val).toBe('Invalid value');
  });

  it('custom errorMessage surfaces as the format error val', () => {
    const collect = createGetTypeErrors<
      FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>
    >();
    const formatErr = collect('c').find((entry) => entry.format?.name === 'stringFormat')?.format;
    expect(formatErr?.val).toBe('pick a or b');
  });

  it('allowedChars default message is "Invalid characters"', () => {
    const collect = createGetTypeErrors<FormatString<{allowedChars: {val: 'abc'}}>>();
    const formatErr = collect('xyz').find((entry) => entry.format?.name === 'stringFormat')?.format;
    expect(formatErr?.val).toBe('Invalid characters');
  });
});

describe('FormatString — idempotency across call sites', () => {
  it('two createIsType calls with identical params share one factory', () => {
    // Two separate call sites with structurally-identical FormatString
    // params must hash to the same RT cache entry. The runtime sees
    // two distinct `createIsType` invocations but the underlying
    // factory closure is the same; comparing the two function
    // references directly is fragile (different `bind` results), so
    // we observe behaviour parity instead.
    const a = createIsType<FormatString<{maxLength: 8}>>();
    const b = createIsType<FormatString<{maxLength: 8}>>();
    const samples = ['', 'a', 'eight!!!', 'nine!!!!!'];
    samples.forEach((sample) => {
      expect(a(sample)).toBe(b(sample));
    });
  });
});
