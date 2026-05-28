// Consolidated string-format adapter suite. Every string format
// (FormatString + rich params, default formats, uuid, date, time,
// dateTime, ip, domain, email, url, registerFormatPattern, the
// createFormatTransform value-transform, and createMockType round-trips)
// is exercised end-to-end here: the vite-plugin-runtypes wires the Go
// binary in via this package's vitest.config.ts, rewrites each call site
// with its resolved RT hash, and emits the cache modules.

import {describe, expect, it} from 'vitest';
import {
  createIsType,
  createGetTypeErrors,
  createMockType,
  createFormatTransform,
  registerFormatPattern,
} from '@mionjs/ts-go-run-types';
import type {
  FormatString,
  FormatAlpha,
  FormatAlphaNumeric,
  FormatNumeric,
  FormatLowercase,
  FormatUppercase,
  FormatCapitalize,
  FormatUUIDv4,
  FormatUUIDv7,
  FormatStringDate,
  FormatStringTime,
  FormatStringDateTime,
  FormatIP,
  FormatIPv4,
  FormatIPv6,
  FormatIPv4WithPort,
  FormatIPv6WithPort,
  FormatDomain,
  FormatDomainStrict,
  FormatEmail,
  FormatEmailPunycode,
  FormatEmailStrict,
  FormatUrl,
  FormatUrlHttp,
  FormatUrlFile,
} from '@mionjs/ts-go-type-formats';
// Side-effect: registers the string-format mock fn with the runtime mock
// registry. Importing the package entry guarantees registration
// regardless of test-runner caching.
import '../../src/index.ts';

// ─────────────────────────── FormatString ───────────────────────────

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
    // params must hash to the same RT cache entry. Comparing the two
    // function references directly is fragile (different `bind` results),
    // so we observe behaviour parity instead.
    const a = createIsType<FormatString<{maxLength: 8}>>();
    const b = createIsType<FormatString<{maxLength: 8}>>();
    const samples = ['', 'a', 'eight!!!', 'nine!!!!!'];
    samples.forEach((sample) => {
      expect(a(sample)).toBe(b(sample));
    });
  });
});

// ─────────────────────── Default string formats ─────────────────────

describe('FormatAlpha', () => {
  it('accepts only letters', () => {
    const isAlpha = createIsType<FormatAlpha>();
    expect(isAlpha('Hello')).toBe(true);
    expect(isAlpha('abcXYZ')).toBe(true);
    expect(isAlpha('hello1')).toBe(false);
    expect(isAlpha('hi there')).toBe(false);
    expect(isAlpha('')).toBe(false);
  });
});

describe('FormatAlphaNumeric', () => {
  it('accepts letters and digits', () => {
    const isAlphaNum = createIsType<FormatAlphaNumeric>();
    expect(isAlphaNum('abc123')).toBe(true);
    expect(isAlphaNum('ABC')).toBe(true);
    expect(isAlphaNum('123')).toBe(true);
    expect(isAlphaNum('a-b')).toBe(false);
    expect(isAlphaNum('a b')).toBe(false);
  });
});

describe('FormatNumeric', () => {
  it('accepts only digits', () => {
    const isNumeric = createIsType<FormatNumeric>();
    expect(isNumeric('12345')).toBe(true);
    expect(isNumeric('007')).toBe(true);
    expect(isNumeric('12.3')).toBe(false);
    expect(isNumeric('12a')).toBe(false);
  });
});

describe('FormatAlpha — combined with length bounds', () => {
  it('applies both the char class and the length bound', () => {
    const isShortAlpha = createIsType<FormatAlpha<{maxLength: 3}>>();
    expect(isShortAlpha('abc')).toBe(true);
    expect(isShortAlpha('abcd')).toBe(false); // too long
    expect(isShortAlpha('a1')).toBe(false); // not alpha
  });
});

describe('FormatLowercase — transformer-only (validates as plain string)', () => {
  it('accepts any string regardless of case (transform not applied at validation)', () => {
    const isLower = createIsType<FormatLowercase>();
    expect(isLower('already lower')).toBe(true);
    expect(isLower('HasUpper')).toBe(true); // transformer doesn't reject
    expect(isLower(42 as unknown as string)).toBe(false); // still must be a string
  });
});

describe('FormatAlpha — typeErrors diagnostics', () => {
  it('non-alpha pushes a pattern TypeFormatError', () => {
    const collect = createGetTypeErrors<FormatAlpha>();
    const errors = collect('abc123');
    const formatErr = errors.find((entry) => entry.format?.name === 'stringFormat')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe('Invalid pattern');
  });

  it('valid alpha yields no errors', () => {
    const collect = createGetTypeErrors<FormatAlpha>();
    expect(collect('Hello')).toEqual([]);
  });
});

// ─────────────────────────────── UUID ───────────────────────────────

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 4
const V7 = '018f1b8c-2e3d-7b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 7

describe('FormatUUIDv4', () => {
  it('accepts a well-formed v4 UUID', () => {
    const isUUIDv4 = createIsType<FormatUUIDv4>();
    expect(isUUIDv4(V4)).toBe(true);
  });

  it('rejects a v7 UUID (wrong version nibble)', () => {
    const isUUIDv4 = createIsType<FormatUUIDv4>();
    expect(isUUIDv4(V7)).toBe(false);
  });

  it('rejects malformed strings', () => {
    const isUUIDv4 = createIsType<FormatUUIDv4>();
    expect(isUUIDv4('not-a-uuid')).toBe(false);
    expect(isUUIDv4('')).toBe(false);
    expect(isUUIDv4(V4.slice(0, 35))).toBe(false); // too short
    expect(isUUIDv4(V4.replace(/-/g, ''))).toBe(false); // missing dashes
    expect(isUUIDv4(123 as unknown as string)).toBe(false);
  });
});

describe('FormatUUIDv7', () => {
  it('accepts a well-formed v7 UUID and rejects a v4 one', () => {
    const isUUIDv7 = createIsType<FormatUUIDv7>();
    expect(isUUIDv7(V7)).toBe(true);
    expect(isUUIDv7(V4)).toBe(false);
  });
});

describe('FormatUUID — typeErrors diagnostics', () => {
  it('invalid UUID pushes a TypeFormatError naming the version', () => {
    const collect = createGetTypeErrors<FormatUUIDv4>();
    const errors = collect('not-a-uuid');
    expect(errors.length).toBeGreaterThan(0);
    const formatErr = errors.find((entry) => entry.format?.name === 'uuid')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe('4');
  });

  it('valid UUID yields no errors', () => {
    const collect = createGetTypeErrors<FormatUUIDv4>();
    expect(collect(V4)).toEqual([]);
  });
});

// ─────────────────────────────── Date ───────────────────────────────

describe('FormatStringDate — ISO / YYYY-MM-DD (default)', () => {
  it('accepts valid ISO dates', () => {
    const isDate = createIsType<FormatStringDate>();
    expect(isDate('2024-02-29')).toBe(true); // leap year
    expect(isDate('2026-05-28')).toBe(true);
    expect(isDate('0001-01-01')).toBe(true);
  });

  it('rejects invalid ISO dates', () => {
    const isDate = createIsType<FormatStringDate>();
    expect(isDate('2023-02-29')).toBe(false); // not a leap year
    expect(isDate('2024-13-01')).toBe(false); // month out of range
    expect(isDate('2024-00-10')).toBe(false); // month zero
    expect(isDate('2024-04-31')).toBe(false); // April has 30 days
    expect(isDate('2024-1-1')).toBe(false); // wrong segment widths
    expect(isDate('not-a-date')).toBe(false);
  });
});

describe('FormatStringDate — alternate layouts', () => {
  it('DD-MM-YYYY', () => {
    const isDate = createIsType<FormatStringDate<{format: 'DD-MM-YYYY'}>>();
    expect(isDate('29-02-2024')).toBe(true);
    expect(isDate('2024-02-29')).toBe(false); // ISO order rejected
    expect(isDate('31-04-2024')).toBe(false); // April has 30 days
  });

  it('MM-DD-YYYY', () => {
    const isDate = createIsType<FormatStringDate<{format: 'MM-DD-YYYY'}>>();
    expect(isDate('02-29-2024')).toBe(true);
    expect(isDate('13-01-2024')).toBe(false);
  });

  it('YYYY-MM (no day)', () => {
    const isDate = createIsType<FormatStringDate<{format: 'YYYY-MM'}>>();
    expect(isDate('2024-02')).toBe(true);
    expect(isDate('2024-13')).toBe(false);
    expect(isDate('2024-02-29')).toBe(false); // day present, layout has none
  });

  it('MM-DD and DD-MM (no year)', () => {
    const isMonthDay = createIsType<FormatStringDate<{format: 'MM-DD'}>>();
    expect(isMonthDay('02-29')).toBe(true);
    expect(isMonthDay('13-01')).toBe(false);

    const isDayMonth = createIsType<FormatStringDate<{format: 'DD-MM'}>>();
    expect(isDayMonth('29-02')).toBe(true);
    expect(isDayMonth('31-04')).toBe(false);
  });
});

describe('FormatStringDate — typeErrors diagnostics', () => {
  it('invalid date pushes a TypeFormatError naming the format', () => {
    const collect = createGetTypeErrors<FormatStringDate>();
    const errors = collect('2023-02-29');
    const formatErr = errors.find((entry) => entry.format?.name === 'date')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe('ISO');
  });

  it('valid date yields no errors', () => {
    const collect = createGetTypeErrors<FormatStringDate>();
    expect(collect('2024-02-29')).toEqual([]);
  });
});

// ─────────────────────────────── Time ───────────────────────────────

describe('FormatStringTime — ISO (default, tz-aware)', () => {
  it('accepts ISO times with Z and numeric offsets', () => {
    const isTime = createIsType<FormatStringTime>();
    expect(isTime('12:30:45Z')).toBe(true);
    expect(isTime('12:30:45.123Z')).toBe(true);
    expect(isTime('12:30:45+05:30')).toBe(true);
    expect(isTime('00:00:00-08:00')).toBe(true);
  });

  it('rejects ISO times without a timezone or out of range', () => {
    const isTime = createIsType<FormatStringTime>();
    expect(isTime('12:30:45')).toBe(false); // no tz
    expect(isTime('24:00:00Z')).toBe(false); // hours out of range
    expect(isTime('12:60:00Z')).toBe(false); // minutes out of range
  });
});

describe('FormatStringTime — fixed layouts', () => {
  it('HH:mm:ss', () => {
    const isTime = createIsType<FormatStringTime<{format: 'HH:mm:ss'}>>();
    expect(isTime('23:59:59')).toBe(true);
    expect(isTime('23:59')).toBe(false);
    expect(isTime('24:00:00')).toBe(false);
  });

  it('HH:mm:ss[.mmm]', () => {
    const isTime = createIsType<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>();
    expect(isTime('12:30:45')).toBe(true);
    expect(isTime('12:30:45.999')).toBe(true);
    expect(isTime('12:30:45.9999')).toBe(false); // 4-digit ms
  });

  it('HH:mm and mm:ss', () => {
    const isHHmm = createIsType<FormatStringTime<{format: 'HH:mm'}>>();
    expect(isHHmm('23:59')).toBe(true);
    expect(isHHmm('24:00')).toBe(false);

    const isMMss = createIsType<FormatStringTime<{format: 'mm:ss'}>>();
    expect(isMMss('59:59')).toBe(true);
    expect(isMMss('60:00')).toBe(false);
  });

  it('bare HH / mm / ss segments', () => {
    const isHH = createIsType<FormatStringTime<{format: 'HH'}>>();
    expect(isHH('23')).toBe(true);
    expect(isHH('24')).toBe(false);

    const isSS = createIsType<FormatStringTime<{format: 'ss'}>>();
    expect(isSS('59')).toBe(true);
    expect(isSS('60')).toBe(false);
  });
});

describe('FormatStringTime — typeErrors diagnostics', () => {
  it('invalid time pushes a TypeFormatError naming the format', () => {
    const collect = createGetTypeErrors<FormatStringTime<{format: 'HH:mm:ss'}>>();
    const errors = collect('99:99:99');
    const formatErr = errors.find((entry) => entry.format?.name === 'time')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe('HH:mm:ss');
  });

  it('valid time yields no errors', () => {
    const collect = createGetTypeErrors<FormatStringTime<{format: 'HH:mm:ss'}>>();
    expect(collect('12:00:00')).toEqual([]);
  });
});

// ───────────────────────────── DateTime ─────────────────────────────

describe('FormatStringDateTime — default (ISO date T ISO time)', () => {
  it('accepts full ISO datetimes', () => {
    const isDateTime = createIsType<FormatStringDateTime>();
    expect(isDateTime('2024-02-29T12:30:45Z')).toBe(true);
    expect(isDateTime('2026-05-28T00:00:00.500+02:00')).toBe(true);
  });

  it('rejects when either half is invalid or the split char is missing', () => {
    const isDateTime = createIsType<FormatStringDateTime>();
    expect(isDateTime('2023-02-29T12:30:45Z')).toBe(false); // bad date (not leap)
    expect(isDateTime('2024-02-29T25:30:45Z')).toBe(false); // bad time (hours)
    expect(isDateTime('2024-02-29T12:30:45')).toBe(false); // time has no tz
    expect(isDateTime('2024-02-29 12:30:45Z')).toBe(false); // wrong split char
    expect(isDateTime('not-a-datetime')).toBe(false);
  });
});

describe('FormatStringDateTime — custom layouts + split char', () => {
  it('honours nested date / time formats and a custom splitChar', () => {
    const isDateTime = createIsType<
      FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>
    >();
    expect(isDateTime('29-02-2024 23:59')).toBe(true);
    expect(isDateTime('2024-02-29 23:59')).toBe(false); // ISO date rejected
    expect(isDateTime('29-02-2024T23:59')).toBe(false); // wrong split char
    expect(isDateTime('29-02-2024 24:00')).toBe(false); // bad time
  });
});

describe('FormatStringDateTime — typeErrors diagnostics', () => {
  it('missing split char reports the splitChar param', () => {
    const collect = createGetTypeErrors<FormatStringDateTime>();
    const errors = collect('2024-02-29 12:30:45Z');
    const formatErr = errors.find((entry) => entry.format?.name === 'dateTime')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.formatPath?.[formatErr.formatPath.length - 1]).toBe('splitChar');
  });

  it('valid datetime yields no errors', () => {
    const collect = createGetTypeErrors<FormatStringDateTime>();
    expect(collect('2024-02-29T12:30:45Z')).toEqual([]);
  });
});

// ──────────────────────────────── IP ────────────────────────────────

describe('FormatIPv4', () => {
  it('accepts dotted-quad addresses', () => {
    const isIp = createIsType<FormatIPv4>();
    expect(isIp('192.168.0.1')).toBe(true);
    expect(isIp('0.0.0.0')).toBe(true);
    expect(isIp('255.255.255.255')).toBe(true);
  });

  it('rejects out-of-range / malformed v4', () => {
    const isIp = createIsType<FormatIPv4>();
    expect(isIp('256.0.0.1')).toBe(false);
    expect(isIp('1.2.3')).toBe(false);
    expect(isIp('1.2.3.4.5')).toBe(false);
    expect(isIp('::1')).toBe(false); // v6 rejected
  });
});

describe('FormatIPv6', () => {
  it('accepts v6 addresses and the loopback', () => {
    const isIp = createIsType<FormatIPv6>();
    expect(isIp('2001:db8:0:0:0:0:0:1')).toBe(true);
    expect(isIp('::1')).toBe(true); // allowLocalHost: true
    expect(isIp('fe80::1')).toBe(true);
  });

  it('rejects v4 and over-long sections', () => {
    const isIp = createIsType<FormatIPv6>();
    expect(isIp('192.168.0.1')).toBe(false);
    expect(isIp('12345::1')).toBe(false); // section too long
  });
});

describe('FormatIP (version any)', () => {
  it('accepts both v4 and v6', () => {
    const isIp = createIsType<FormatIP>();
    expect(isIp('10.0.0.1')).toBe(true);
    expect(isIp('2001:db8::1')).toBe(true);
    expect(isIp('definitely not an ip')).toBe(false);
  });
});

describe('FormatIP — with port', () => {
  it('v4 with port', () => {
    const isIp = createIsType<FormatIPv4WithPort>();
    expect(isIp('192.168.0.1:8080')).toBe(true);
    expect(isIp('192.168.0.1:70000')).toBe(false); // port out of range
  });

  it('v6 with bracketed port', () => {
    const isIp = createIsType<FormatIPv6WithPort>();
    expect(isIp('[2001:db8::1]:443')).toBe(true);
    expect(isIp('[2001:db8::1]:99999')).toBe(false);
  });
});

describe('FormatIP — typeErrors diagnostics', () => {
  it('invalid IP pushes a TypeFormatError naming the version', () => {
    const collect = createGetTypeErrors<FormatIPv4>();
    const errors = collect('999.999.999.999');
    const formatErr = errors.find((entry) => entry.format?.name === 'ip')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe(4);
  });

  it('valid IP yields no errors', () => {
    const collect = createGetTypeErrors<FormatIPv4>();
    expect(collect('192.168.0.1')).toEqual([]);
  });
});

// ────────────────────────────── Domain ──────────────────────────────

describe('FormatDomain — standard', () => {
  it('accepts valid domains', () => {
    const isDomain = createIsType<FormatDomain>();
    expect(isDomain('mion.io')).toBe(true);
    expect(isDomain('example.com')).toBe(true);
    expect(isDomain('sub.example.co.uk')).toBe(true);
    expect(isDomain('a-b.example.org')).toBe(true);
  });

  it('rejects malformed domains', () => {
    const isDomain = createIsType<FormatDomain>();
    expect(isDomain('no-tld')).toBe(false);
    expect(isDomain('.com')).toBe(false);
    expect(isDomain('example.c')).toBe(false); // tld too short
    expect(isDomain('-bad.com')).toBe(false); // leading hyphen
    expect(isDomain('exa mple.com')).toBe(false); // space
    expect(isDomain('')).toBe(false);
  });
});

describe('FormatDomainStrict — decomposition (names/tld, maxParts, hyphen-edge)', () => {
  it('accepts canonical multi-part domains within the part bound', () => {
    const isStrict = createIsType<FormatDomainStrict>();
    expect(isStrict('mion.io')).toBe(true);
    expect(isStrict('sub.example.com')).toBe(true);
    expect(isStrict('aa.bb.cc.dd.ee.com')).toBe(true); // exactly 6 parts
  });

  it('rejects domains with more than 6 parts', () => {
    const isStrict = createIsType<FormatDomainStrict>();
    expect(isStrict('aa.bb.cc.dd.ee.ff.com')).toBe(false); // 7 parts
  });

  it('rejects labels with a leading or trailing hyphen', () => {
    const isStrict = createIsType<FormatDomainStrict>();
    expect(isStrict('-bad.com')).toBe(false);
    expect(isStrict('bad-.com')).toBe(false);
    expect(isStrict('ok.-bad.com')).toBe(false); // middle label
  });

  it('rejects bad tld and label characters', () => {
    const isStrict = createIsType<FormatDomainStrict>();
    expect(isStrict('example.123')).toBe(false); // tld must be alphabetical
    expect(isStrict('ex_ample.com')).toBe(false); // underscore not allowed in label
    expect(isStrict('localhost')).toBe(false); // single part < minParts 2
  });

  it('pushes a TypeFormatError for a hyphen-edge label', () => {
    const collect = createGetTypeErrors<FormatDomainStrict>();
    const errors = collect('-bad.com');
    const formatErr = errors.find((entry) => entry.format?.name === 'domain')?.format;
    expect(formatErr).toBeDefined();
  });
});

describe('FormatDomain — typeErrors diagnostics', () => {
  it('invalid domain pushes a TypeFormatError named domain', () => {
    const collect = createGetTypeErrors<FormatDomain>();
    const errors = collect('not-a-domain');
    const formatErr = errors.find((entry) => entry.format?.name === 'domain')?.format;
    expect(formatErr).toBeDefined();
  });

  it('valid domain yields no errors', () => {
    const collect = createGetTypeErrors<FormatDomain>();
    expect(collect('mion.io')).toEqual([]);
  });
});

// ─────────────────────────────── Email ──────────────────────────────

describe('FormatEmail — standard', () => {
  it('accepts valid emails', () => {
    const isEmail = createIsType<FormatEmail>();
    expect(isEmail('john@example.com')).toBe(true);
    expect(isEmail('jane.doe@mion.io')).toBe(true);
    expect(isEmail('ab@cd.co')).toBe(true); // 8 chars — above the 7-char default minLength
    expect(isEmail('user+tag@sub.example.org')).toBe(true);
  });

  it('rejects emails shorter than the 7-char default minLength', () => {
    const isEmail = createIsType<FormatEmail>();
    expect(isEmail('a@b.co')).toBe(false); // 6 chars
  });

  it('rejects malformed emails', () => {
    const isEmail = createIsType<FormatEmail>();
    expect(isEmail('no-at-symbol')).toBe(false);
    expect(isEmail('@example.com')).toBe(false); // empty local part
    expect(isEmail('john@')).toBe(false); // empty domain
    expect(isEmail('john@example')).toBe(false); // no tld
    expect(isEmail('john doe@example.com')).toBe(false); // space
    expect(isEmail('')).toBe(false);
  });
});

describe('FormatEmailPunycode', () => {
  it('accepts punycode-tld domains the standard variant rejects', () => {
    const isPuny = createIsType<FormatEmailPunycode>();
    expect(isPuny('john@example.xn--fiqs8s')).toBe(true);
    const isStandard = createIsType<FormatEmail>();
    expect(isStandard('john@example.xn--fiqs8s')).toBe(false);
  });
});

describe('FormatEmailStrict — localPart + domain decomposition', () => {
  it('accepts canonical addresses', () => {
    const isStrict = createIsType<FormatEmailStrict>();
    expect(isStrict('john@example.com')).toBe(true);
    expect(isStrict('jane.doe@mion.io')).toBe(true); // dot allowed in local part
  });

  it('rejects aliasing / structural chars in the local part', () => {
    const isStrict = createIsType<FormatEmailStrict>();
    expect(isStrict('a+b@x.com')).toBe(false); // '+' disallowed (aliasing)
    expect(isStrict('a b@example.com')).toBe(false); // space disallowed
    expect(isStrict('john@@example.com')).toBe(false); // '@' lands in local part
  });

  it('rejects when the domain half is invalid', () => {
    const isStrict = createIsType<FormatEmailStrict>();
    expect(isStrict('john@bad_domain.com')).toBe(false); // underscore in label
    expect(isStrict('john@example')).toBe(false); // no tld → single part
    expect(isStrict('no-at-symbol')).toBe(false);
  });

  it('pushes a TypeFormatError for a disallowed local-part char', () => {
    const collect = createGetTypeErrors<FormatEmailStrict>();
    const errors = collect('a+b@example.com');
    const formatErr = errors.find((entry) => entry.format?.name === 'email')?.format;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe('Invalid characters in email local part');
  });
});

describe('FormatEmail — typeErrors diagnostics', () => {
  it('invalid email pushes a TypeFormatError named email', () => {
    const collect = createGetTypeErrors<FormatEmail>();
    const errors = collect('not-an-email');
    const formatErr = errors.find((entry) => entry.format?.name === 'email')?.format;
    expect(formatErr).toBeDefined();
  });

  it('valid email yields no errors', () => {
    const collect = createGetTypeErrors<FormatEmail>();
    expect(collect('john@example.com')).toEqual([]);
  });
});

// ──────────────────────────────── URL ───────────────────────────────

describe('FormatUrl — standard (http/ftp/ws schemes)', () => {
  it('accepts common URLs', () => {
    const isUrl = createIsType<FormatUrl>();
    expect(isUrl('https://example.com')).toBe(true);
    expect(isUrl('http://mion.io/path?q=1')).toBe(true);
    expect(isUrl('ftp://files.example.org')).toBe(true);
    expect(isUrl('wss://socket.example.com')).toBe(true);
  });

  it('rejects malformed / unsupported-scheme URLs', () => {
    const isUrl = createIsType<FormatUrl>();
    expect(isUrl('not a url')).toBe(false);
    expect(isUrl('example.com')).toBe(false); // no scheme
    expect(isUrl('mailto:john@example.com')).toBe(false);
    expect(isUrl('https://')).toBe(false);
  });
});

describe('FormatUrlHttp', () => {
  it('accepts only http(s) URLs', () => {
    const isHttp = createIsType<FormatUrlHttp>();
    expect(isHttp('https://example.com')).toBe(true);
    expect(isHttp('http://example.com')).toBe(true);
    expect(isHttp('ftp://example.com')).toBe(false);
  });
});

describe('FormatUrlFile', () => {
  it('accepts file URLs', () => {
    const isFile = createIsType<FormatUrlFile>();
    expect(isFile('file:///etc/hosts')).toBe(true);
    expect(isFile('https://example.com')).toBe(false);
  });
});

describe('FormatUrl — typeErrors diagnostics', () => {
  it('invalid URL pushes a TypeFormatError named url', () => {
    const collect = createGetTypeErrors<FormatUrl>();
    const errors = collect('not-a-url');
    const formatErr = errors.find((entry) => entry.format?.name === 'url')?.format;
    expect(formatErr).toBeDefined();
  });

  it('valid URL yields no errors', () => {
    const collect = createGetTypeErrors<FormatUrl>();
    expect(collect('https://example.com')).toEqual([]);
  });
});

// ─────────────────────── registerFormatPattern ──────────────────────

const slug = registerFormatPattern({
  regexp: /^[a-z0-9-]+$/,
  mockSamples: ['my-slug', 'abc', 'a-b-c'],
  message: 'must be a slug',
});

type Slug = FormatString<{pattern: typeof slug}>;

describe('registerFormatPattern — isType', () => {
  it('validates with the regex recovered from the call site', () => {
    const isSlug = createIsType<Slug>();
    expect(isSlug('my-slug')).toBe(true);
    expect(isSlug('a-b-c')).toBe(true);
    expect(isSlug('Has Capitals')).toBe(false);
    expect(isSlug('UPPER')).toBe(false);
    expect(isSlug('has space')).toBe(false);
    expect(isSlug('')).toBe(false);
  });
});

describe('registerFormatPattern — mock round-trip', () => {
  it('draws from the pattern samples; every mock passes isType', () => {
    const mock = createMockType<Slug>();
    const isSlug = createIsType<Slug>();
    const seen = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const value = mock() as string;
      seen.add(value);
      expect(isSlug(value)).toBe(true);
    }
    // Mock values come from the declared samples.
    for (const value of seen) expect(['my-slug', 'abc', 'a-b-c']).toContain(value);
  });
});

// {source, flags} overload — same recovery (from the string literals in
// the call AST) as the /regex/ form.
const hex = registerFormatPattern({source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']});
type Hex = FormatString<{pattern: typeof hex}>;

describe('registerFormatPattern — {source, flags} overload', () => {
  it('recovers source+flags passed as string literals', () => {
    const isHex = createIsType<Hex>();
    expect(isHex('0042')).toBe(true);
    expect(isHex('DEADbeef')).toBe(true); // `i` flag folds case
    expect(isHex('xyz')).toBe(false);
    expect(isHex('')).toBe(false);
  });
});

describe('registerFormatPattern — registration-time sample validation (real engine)', () => {
  it('throws when a mockSample does not match its own regexp', () => {
    expect(() =>
      registerFormatPattern({regexp: /^[0-9]+$/, mockSamples: ['123', 'not-a-number']}),
    ).toThrow(/does not match/);
  });

  it('accepts samples that all match', () => {
    expect(() => registerFormatPattern({regexp: /^[0-9]+$/, mockSamples: ['123', '007']})).not.toThrow();
  });
});

// ──────────────────── createFormatTransform (format) ─────────────────

describe('createFormatTransform — string transforms', () => {
  it('lowercases', () => {
    const fmt = createFormatTransform<FormatLowercase>();
    expect(fmt('ABC')).toBe('abc');
    expect(fmt('MixedCase')).toBe('mixedcase');
  });

  it('uppercases', () => {
    const fmt = createFormatTransform<FormatUppercase>();
    expect(fmt('abc')).toBe('ABC');
  });

  it('capitalizes', () => {
    const fmt = createFormatTransform<FormatCapitalize>();
    expect(fmt('hello')).toBe('Hello');
  });

  it('trims', () => {
    const fmt = createFormatTransform<FormatString<{trim: true}>>();
    expect(fmt('  padded  ')).toBe('padded');
  });
});

describe('createFormatTransform — identity for non-transforming types', () => {
  it('plain string passes through unchanged', () => {
    const fmt = createFormatTransform<string>();
    expect(fmt('ABC')).toBe('ABC');
  });

  it('a length-only stringFormat does not transform', () => {
    const fmt = createFormatTransform<FormatString<{maxLength: 10}>>();
    expect(fmt('ABC')).toBe('ABC');
  });

  it('uuid (no transform) passes through unchanged', () => {
    const fmt = createFormatTransform<FormatUUIDv4>();
    expect(fmt('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA')).toBe('AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA');
  });
});

describe('createFormatTransform — nested object recursion', () => {
  it('transforms only the format-branded field', () => {
    const fmt = createFormatTransform<{name: FormatLowercase; age: number; tag: string}>();
    const out = fmt({name: 'ALICE', age: 30, tag: 'KEEP'});
    expect(out).toEqual({name: 'alice', age: 30, tag: 'KEEP'});
  });

  it('transforms format-branded array elements', () => {
    const fmt = createFormatTransform<FormatLowercase[]>();
    expect(fmt(['A', 'Bc', 'DEF'])).toEqual(['a', 'bc', 'def']);
  });
});

describe('createFormatTransform — round-trips through isType', () => {
  it('format output satisfies the matching isType', () => {
    const fmt = createFormatTransform<FormatLowercase>();
    const isLower = createIsType<FormatLowercase>();
    const out = fmt('MixedCase');
    expect(isLower(out)).toBe(true);
  });
});

// ────────────────────────────── Mocking ─────────────────────────────

describe('createMockType — format round-trips (mock output passes isType)', () => {
  it('FormatUUIDv4', () => {
    const mock = createMockType<FormatUUIDv4>();
    const isUUID = createIsType<FormatUUIDv4>();
    for (let i = 0; i < 20; i++) expect(isUUID(mock() as string)).toBe(true);
  });

  it('FormatEmail draws from samples', () => {
    const mock = createMockType<FormatEmail>();
    const isEmail = createIsType<FormatEmail>();
    for (let i = 0; i < 20; i++) {
      const value = mock() as string;
      expect(typeof value).toBe('string');
      expect(isEmail(value)).toBe(true);
    }
  });

  it('FormatDomain draws from samples', () => {
    const mock = createMockType<FormatDomain>();
    const isDomain = createIsType<FormatDomain>();
    for (let i = 0; i < 20; i++) expect(isDomain(mock() as string)).toBe(true);
  });

  it('FormatUrl draws from samples', () => {
    const mock = createMockType<FormatUrl>();
    const isUrl = createIsType<FormatUrl>();
    for (let i = 0; i < 20; i++) expect(isUrl(mock() as string)).toBe(true);
  });

  it('FormatStringDate', () => {
    const mock = createMockType<FormatStringDate>();
    const isDate = createIsType<FormatStringDate>();
    for (let i = 0; i < 20; i++) expect(isDate(mock() as string)).toBe(true);
  });

  it('FormatAlpha / FormatNumeric draw from samples', () => {
    const mockAlpha = createMockType<FormatAlpha>();
    const isAlpha = createIsType<FormatAlpha>();
    for (let i = 0; i < 20; i++) expect(isAlpha(mockAlpha() as string)).toBe(true);

    const mockNum = createMockType<FormatNumeric>();
    const isNum = createIsType<FormatNumeric>();
    for (let i = 0; i < 20; i++) expect(isNum(mockNum() as string)).toBe(true);
  });
});

describe('createMockType — value transform applied after mock', () => {
  it('FormatLowercase mock is lowercased', () => {
    const mock = createMockType<FormatLowercase>();
    for (let i = 0; i < 20; i++) {
      const value = mock() as string;
      expect(value).toBe(value.toLowerCase());
    }
  });

  it('FormatUppercase mock is uppercased', () => {
    const mock = createMockType<FormatUppercase>();
    for (let i = 0; i < 20; i++) {
      const value = mock() as string;
      expect(value).toBe(value.toUpperCase());
    }
  });
});
