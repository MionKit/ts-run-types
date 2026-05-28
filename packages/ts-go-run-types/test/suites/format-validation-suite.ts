// Format validation suite — the type-format sibling of
// `validation-suite.ts`. Single source of truth for the isType /
// getTypeErrors / mockType behavioral assertions of every type format,
// ported from the old consolidated
// `ts-go-type-formats/test/adapters/stringFormats.test.ts`.
//
// Only the `STRING_FORMAT` section exists today; number / bigint format
// families land in later phases under sibling top-level keys.
//
// Each case reuses the `ValidationCase` shape (so the extracted
// `assertIsType` / `assertMockType` helpers run formats unchanged) plus
// a format-specific `expectedFormatErrors` field: format diagnostics
// carry a `format: {name, val, formatPath}` payload, and the format
// getTypeErrors adapter matches on those fields rather than a brittle
// full-object deep-equal.
//
// The bare `import '@mionjs/ts-go-run-types/formats'` is load-bearing:
// it registers the string-format mock fn, the built-in patterns, and
// the pure-fn factories. A type-only import of the aliases below would
// be elided and the registrations would never run.

import {createIsType, createGetTypeErrors, createMockType, registerFormatPattern} from '@mionjs/ts-go-run-types';
import type {ValidationCase} from './validation-suite.ts';
import '@mionjs/ts-go-run-types/formats';
import type {
  FormatString,
  FormatAlpha,
  FormatAlphaNumeric,
  FormatNumeric,
  FormatLowercase,
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
} from '@mionjs/ts-go-run-types/formats';

/** One expected format-error descriptor, index-parallel to a case's
 *  invalid samples. `null` means "expect at least one error but assert
 *  nothing about its format payload". A descriptor asserts the named
 *  format error is present and, when provided, its `val` and the tail
 *  of its `formatPath`. **/
export interface FormatErrorExpectation {
  /** `format.name` — e.g. 'stringFormat' | 'uuid' | 'date' | 'time' |
   *  'dateTime' | 'ip' | 'domain' | 'email' | 'url'. **/
  name: string;
  /** `format.val` to assert (deep-equal). Omit to skip. **/
  val?: unknown;
  /** Last segment of `format.formatPath` to assert. Omit to skip. **/
  formatPathTail?: string;
}

/** A format validation case — a `ValidationCase` (isType / getTypeErrors
 *  / mockType thunks + samples) plus the optional format-error
 *  expectations consumed by the format getTypeErrors adapter. **/
export type FormatValidationCase = ValidationCase & {
  expectedFormatErrors?: () => Array<FormatErrorExpectation | null>;
};

// Custom patterns registered once at module load — the call sites the
// Go scanner recovers {source, flags, mockSamples} from. Mirrors the
// `registerFormatPattern` block in the old stringFormats.test.ts.
const slug = registerFormatPattern({
  regexp: /^[a-z0-9-]+$/,
  mockSamples: ['my-slug', 'abc', 'a-b-c'],
  message: 'must be a slug',
});
type Slug = FormatString<{pattern: typeof slug}>;

const hex = registerFormatPattern({source: '^[0-9a-f]+$', flags: 'i', mockSamples: ['DEADbeef', '0042']});
type Hex = FormatString<{pattern: typeof hex}>;

const V4 = '9f1b8c2e-3d4a-4b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 4
const V7 = '018f1b8c-2e3d-7b5c-8d6e-1f2a3b4c5d6e'; // version nibble = 7

export const FORMAT_VALIDATION_SUITE: {STRING_FORMAT: Record<string, FormatValidationCase>} = {
  STRING_FORMAT: {
    // ─────────────────────────── FormatString ───────────────────────
    string_maxLength: {
      title: 'FormatString maxLength — bounds the upper length',
      isType: () => createIsType<FormatString<{maxLength: 5}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{maxLength: 5}>>(),
      getSamples: () => ({valid: ['', 'hello'], invalid: ['hello!', 42]}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 5}, null],
    },
    string_minLength: {
      title: 'FormatString minLength — bounds the lower length',
      isType: () => createIsType<FormatString<{minLength: 3}>>(),
      getSamples: () => ({valid: ['abc', 'abcd'], invalid: ['ab', '']}),
    },
    string_length: {
      title: 'FormatString length — exact length only',
      isType: () => createIsType<FormatString<{length: 4}>>(),
      getSamples: () => ({valid: ['abcd'], invalid: ['abc', 'abcde']}),
    },
    string_range: {
      title: 'FormatString minLength + maxLength — bounds both ends',
      isType: () => createIsType<FormatString<{minLength: 2; maxLength: 4}>>(),
      getSamples: () => ({valid: ['ab', 'abcd'], invalid: ['a', 'abcde']}),
    },
    string_allowedChars: {
      title: 'FormatString allowedChars — only the allowed set passes',
      isType: () => createIsType<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{allowedChars: {val: '0123456789abcdef'}}>>(),
      getSamples: () => ({valid: ['deadbeef', '0042'], invalid: ['xyz', 'dead beef', '']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid characters'}, null, null],
    },
    string_allowedChars_ignoreCase: {
      title: 'FormatString allowedChars ignoreCase — folds case',
      isType: () => createIsType<FormatString<{allowedChars: {val: 'abc'; ignoreCase: true}}>>(),
      getSamples: () => ({valid: ['ABC', 'aAbBcC'], invalid: ['abcd']}),
    },
    string_allowedChars_literal: {
      title: 'FormatString allowedChars — regex-special chars treated literally',
      isType: () => createIsType<FormatString<{allowedChars: {val: '.-'}}>>(),
      getSamples: () => ({valid: ['...---'], invalid: ['a']}),
    },
    string_disallowedChars: {
      title: 'FormatString disallowedChars — rejects any disallowed char',
      isType: () => createIsType<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
      mockType: () => createMockType<FormatString<{disallowedChars: {val: '!@#'; mockSamples: 'abc'}}>>(),
      getSamples: () => ({valid: ['hello'], invalid: ['hi!', 'a@b']}),
    },
    string_allowedValues: {
      title: 'FormatString allowedValues — enum-like exact match',
      isType: () => createIsType<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{allowedValues: {val: ['red', 'green', 'blue']}}>>(),
      getSamples: () => ({valid: ['red', 'blue'], invalid: ['yellow', 'RED', 'redgreen']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid value'}, null, null],
    },
    string_allowedValues_ignoreCase: {
      title: 'FormatString allowedValues ignoreCase — folds case across the set',
      isType: () => createIsType<FormatString<{allowedValues: {val: ['red', 'green']; ignoreCase: true}}>>(),
      getSamples: () => ({valid: ['RED', 'Green'], invalid: ['blue']}),
    },
    string_allowedValues_escaped: {
      title: 'FormatString allowedValues — regex-special chars matched literally',
      isType: () => createIsType<FormatString<{allowedValues: {val: ['a.b', 'c+d']}}>>(),
      getSamples: () => ({valid: ['a.b', 'c+d'], invalid: ['axb', 'ccd']}),
    },
    string_disallowedValues: {
      title: 'FormatString disallowedValues — rejects the listed values',
      isType: () => createIsType<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
      mockType: () => createMockType<FormatString<{disallowedValues: {val: ['admin', 'root']; mockSamples: ['alice', 'bob']}}>>(),
      getSamples: () => ({valid: ['alice'], invalid: ['admin', 'root']}),
    },
    string_customErrorMessage: {
      title: 'FormatString allowedValues — custom errorMessage surfaces as format.val',
      isType: () => createIsType<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatString<{allowedValues: {val: ['a', 'b']; errorMessage: 'pick a or b'}}>>(),
      getSamples: () => ({valid: ['a', 'b'], invalid: ['c']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'pick a or b'}],
    },

    // ─────────────────────── Default string formats ─────────────────
    alpha: {
      title: 'FormatAlpha — letters only',
      isType: () => createIsType<FormatAlpha>(),
      getTypeErrors: () => createGetTypeErrors<FormatAlpha>(),
      mockType: () => createMockType<FormatAlpha>(),
      getSamples: () => ({valid: ['Hello', 'abcXYZ'], invalid: ['hello1', 'hi there', '']}),
      expectedFormatErrors: () => [{name: 'stringFormat', val: 'Invalid pattern'}, null, null],
    },
    alphaNumeric: {
      title: 'FormatAlphaNumeric — letters and digits',
      isType: () => createIsType<FormatAlphaNumeric>(),
      mockType: () => createMockType<FormatAlphaNumeric>(),
      getSamples: () => ({valid: ['abc123', 'ABC', '123'], invalid: ['a-b', 'a b']}),
    },
    numeric: {
      title: 'FormatNumeric — digits only',
      isType: () => createIsType<FormatNumeric>(),
      mockType: () => createMockType<FormatNumeric>(),
      getSamples: () => ({valid: ['12345', '007'], invalid: ['12.3', '12a']}),
    },
    alpha_withLength: {
      title: 'FormatAlpha with maxLength — char class plus length bound',
      isType: () => createIsType<FormatAlpha<{maxLength: 3}>>(),
      getSamples: () => ({valid: ['abc'], invalid: ['abcd', 'a1']}),
    },
    lowercase_validate: {
      title: 'FormatLowercase — transformer-only, validates as a plain string',
      isType: () => createIsType<FormatLowercase>(),
      mockType: () => createMockType<FormatLowercase>(),
      getSamples: () => ({valid: ['already lower', 'HasUpper'], invalid: [42]}),
    },

    // ─────────────────────────────── UUID ───────────────────────────
    uuidv4: {
      title: 'FormatUUIDv4 — accepts v4, rejects v7 and malformed',
      isType: () => createIsType<FormatUUIDv4>(),
      getTypeErrors: () => createGetTypeErrors<FormatUUIDv4>(),
      mockType: () => createMockType<FormatUUIDv4>(),
      getSamples: () => ({valid: [V4], invalid: [V7, 'not-a-uuid', '', V4.replace(/-/g, ''), 123]}),
      expectedFormatErrors: () => [{name: 'uuid', val: '4'}, {name: 'uuid', val: '4'}, null, null, null],
    },
    uuidv7: {
      title: 'FormatUUIDv7 — accepts v7, rejects v4',
      isType: () => createIsType<FormatUUIDv7>(),
      mockType: () => createMockType<FormatUUIDv7>(),
      getSamples: () => ({valid: [V7], invalid: [V4]}),
    },

    // ─────────────────────────────── Date ───────────────────────────
    date_iso: {
      title: 'FormatStringDate — ISO / YYYY-MM-DD (default)',
      isType: () => createIsType<FormatStringDate>(),
      getTypeErrors: () => createGetTypeErrors<FormatStringDate>(),
      mockType: () => createMockType<FormatStringDate>(),
      getSamples: () => ({
        valid: ['2024-02-29', '2026-05-28', '0001-01-01'],
        invalid: ['2023-02-29', '2024-13-01', '2024-04-31', '2024-1-1', 'not-a-date'],
      }),
      expectedFormatErrors: () => [{name: 'date', val: 'ISO'}, null, null, null, null],
    },
    date_DMY: {
      title: 'FormatStringDate — DD-MM-YYYY layout',
      isType: () => createIsType<FormatStringDate<{format: 'DD-MM-YYYY'}>>(),
      getSamples: () => ({valid: ['29-02-2024'], invalid: ['2024-02-29', '31-04-2024']}),
    },
    date_YM: {
      title: 'FormatStringDate — YYYY-MM layout (no day)',
      isType: () => createIsType<FormatStringDate<{format: 'YYYY-MM'}>>(),
      getSamples: () => ({valid: ['2024-02'], invalid: ['2024-13', '2024-02-29']}),
    },
    date_MD: {
      title: 'FormatStringDate — MM-DD layout (no year)',
      isType: () => createIsType<FormatStringDate<{format: 'MM-DD'}>>(),
      getSamples: () => ({valid: ['02-29'], invalid: ['13-01']}),
    },

    // ─────────────────────────────── Time ───────────────────────────
    time_iso: {
      title: 'FormatStringTime — ISO (default, tz-aware)',
      isType: () => createIsType<FormatStringTime>(),
      getSamples: () => ({
        valid: ['12:30:45Z', '12:30:45.123Z', '12:30:45+05:30', '00:00:00-08:00'],
        invalid: ['12:30:45', '24:00:00Z', '12:60:00Z'],
      }),
    },
    time_HHmmss: {
      title: 'FormatStringTime — HH:mm:ss fixed layout',
      isType: () => createIsType<FormatStringTime<{format: 'HH:mm:ss'}>>(),
      getTypeErrors: () => createGetTypeErrors<FormatStringTime<{format: 'HH:mm:ss'}>>(),
      getSamples: () => ({valid: ['23:59:59'], invalid: ['99:99:99', '23:59', '24:00:00']}),
      expectedFormatErrors: () => [{name: 'time', val: 'HH:mm:ss'}, null, null],
    },
    time_HHmmss_ms: {
      title: 'FormatStringTime — HH:mm:ss[.mmm] optional milliseconds',
      isType: () => createIsType<FormatStringTime<{format: 'HH:mm:ss[.mmm]'}>>(),
      getSamples: () => ({valid: ['12:30:45', '12:30:45.999'], invalid: ['12:30:45.9999']}),
    },

    // ───────────────────────────── DateTime ─────────────────────────
    dateTime_default: {
      title: 'FormatStringDateTime — default (ISO date T ISO time)',
      isType: () => createIsType<FormatStringDateTime>(),
      getTypeErrors: () => createGetTypeErrors<FormatStringDateTime>(),
      getSamples: () => ({
        valid: ['2024-02-29T12:30:45Z', '2026-05-28T00:00:00.500+02:00'],
        invalid: ['2024-02-29 12:30:45Z', '2023-02-29T12:30:45Z', '2024-02-29T25:30:45Z', 'not-a-datetime'],
      }),
      expectedFormatErrors: () => [{name: 'dateTime', formatPathTail: 'splitChar'}, null, null, null],
    },
    dateTime_custom: {
      title: 'FormatStringDateTime — custom nested layouts + splitChar',
      isType: () => createIsType<FormatStringDateTime<{date: {format: 'DD-MM-YYYY'}; time: {format: 'HH:mm'}; splitChar: ' '}>>(),
      getSamples: () => ({
        valid: ['29-02-2024 23:59'],
        invalid: ['2024-02-29 23:59', '29-02-2024T23:59', '29-02-2024 24:00'],
      }),
    },

    // ──────────────────────────────── IP ────────────────────────────
    ipv4: {
      title: 'FormatIPv4 — dotted-quad addresses',
      isType: () => createIsType<FormatIPv4>(),
      getTypeErrors: () => createGetTypeErrors<FormatIPv4>(),
      getSamples: () => ({
        valid: ['192.168.0.1', '0.0.0.0', '255.255.255.255'],
        invalid: ['999.999.999.999', '256.0.0.1', '1.2.3', '::1'],
      }),
      expectedFormatErrors: () => [{name: 'ip', val: 4}, null, null, null],
    },
    ipv6: {
      title: 'FormatIPv6 — colon-separated, loopback allowed',
      isType: () => createIsType<FormatIPv6>(),
      getSamples: () => ({valid: ['2001:db8:0:0:0:0:0:1', '::1', 'fe80::1'], invalid: ['192.168.0.1', '12345::1']}),
    },
    ip_any: {
      title: 'FormatIP — accepts both v4 and v6',
      isType: () => createIsType<FormatIP>(),
      getSamples: () => ({valid: ['10.0.0.1', '2001:db8::1'], invalid: ['definitely not an ip']}),
    },
    ipv4_port: {
      title: 'FormatIPv4WithPort — v4 with port',
      isType: () => createIsType<FormatIPv4WithPort>(),
      getSamples: () => ({valid: ['192.168.0.1:8080'], invalid: ['192.168.0.1:70000']}),
    },
    ipv6_port: {
      title: 'FormatIPv6WithPort — v6 with bracketed port',
      isType: () => createIsType<FormatIPv6WithPort>(),
      getSamples: () => ({valid: ['[2001:db8::1]:443'], invalid: ['[2001:db8::1]:99999']}),
    },

    // ────────────────────────────── Domain ──────────────────────────
    domain: {
      title: 'FormatDomain — standard',
      isType: () => createIsType<FormatDomain>(),
      getTypeErrors: () => createGetTypeErrors<FormatDomain>(),
      mockType: () => createMockType<FormatDomain>(),
      getSamples: () => ({
        valid: ['mion.io', 'example.com', 'sub.example.co.uk', 'a-b.example.org'],
        invalid: ['not-a-domain', '.com', 'example.c', '-bad.com', 'exa mple.com', ''],
      }),
      expectedFormatErrors: () => [{name: 'domain'}, null, null, null, null, null],
    },
    domainStrict: {
      title: 'FormatDomainStrict — names/tld decomposition, maxParts, hyphen-edge',
      isType: () => createIsType<FormatDomainStrict>(),
      getTypeErrors: () => createGetTypeErrors<FormatDomainStrict>(),
      getSamples: () => ({
        valid: ['mion.io', 'sub.example.com', 'aa.bb.cc.dd.ee.com'],
        invalid: ['-bad.com', 'aa.bb.cc.dd.ee.ff.com', 'example.123', 'ex_ample.com', 'localhost'],
      }),
      expectedFormatErrors: () => [{name: 'domain'}, null, null, null, null],
    },

    // ─────────────────────────────── Email ──────────────────────────
    email: {
      title: 'FormatEmail — standard',
      isType: () => createIsType<FormatEmail>(),
      getTypeErrors: () => createGetTypeErrors<FormatEmail>(),
      mockType: () => createMockType<FormatEmail>(),
      getSamples: () => ({
        valid: ['john@example.com', 'jane.doe@mion.io', 'ab@cd.co', 'user+tag@sub.example.org'],
        invalid: ['not-an-email', 'a@b.co', '@example.com', 'john@', 'john@example', 'john doe@example.com', ''],
      }),
      expectedFormatErrors: () => [{name: 'email'}, null, null, null, null, null, null],
    },
    emailPunycode: {
      title: 'FormatEmailPunycode — accepts punycode-tld domains',
      isType: () => createIsType<FormatEmailPunycode>(),
      getSamples: () => ({valid: ['john@example.xn--fiqs8s'], invalid: ['not-an-email']}),
    },
    emailStrict: {
      title: 'FormatEmailStrict — localPart + domain decomposition',
      isType: () => createIsType<FormatEmailStrict>(),
      getTypeErrors: () => createGetTypeErrors<FormatEmailStrict>(),
      getSamples: () => ({
        valid: ['john@example.com', 'jane.doe@mion.io'],
        invalid: ['a+b@x.com', 'a b@example.com', 'john@@example.com', 'john@bad_domain.com', 'no-at-symbol'],
      }),
      expectedFormatErrors: () => [{name: 'email', val: 'Invalid characters in email local part'}, null, null, null, null],
    },

    // ──────────────────────────────── URL ───────────────────────────
    url: {
      title: 'FormatUrl — standard (http/ftp/ws schemes)',
      isType: () => createIsType<FormatUrl>(),
      getTypeErrors: () => createGetTypeErrors<FormatUrl>(),
      mockType: () => createMockType<FormatUrl>(),
      getSamples: () => ({
        valid: ['https://example.com', 'http://mion.io/path?q=1', 'ftp://files.example.org', 'wss://socket.example.com'],
        invalid: ['not-a-url', 'example.com', 'mailto:john@example.com', 'https://'],
      }),
      expectedFormatErrors: () => [{name: 'url'}, null, null, null],
    },
    urlHttp: {
      title: 'FormatUrlHttp — http(s) only',
      isType: () => createIsType<FormatUrlHttp>(),
      getSamples: () => ({valid: ['https://example.com', 'http://example.com'], invalid: ['ftp://example.com']}),
    },
    urlFile: {
      title: 'FormatUrlFile — file URLs',
      isType: () => createIsType<FormatUrlFile>(),
      getSamples: () => ({valid: ['file:///etc/hosts'], invalid: ['https://example.com']}),
    },

    // ─────────────────────── registerFormatPattern ──────────────────
    pattern_slug: {
      title: 'registerFormatPattern — slug regex recovered from the call site',
      isType: () => createIsType<Slug>(),
      mockType: () => createMockType<Slug>(),
      getSamples: () => ({valid: ['my-slug', 'a-b-c'], invalid: ['Has Capitals', 'UPPER', 'has space', '']}),
    },
    pattern_hex: {
      title: 'registerFormatPattern — {source, flags} overload (case-insensitive)',
      isType: () => createIsType<Hex>(),
      getSamples: () => ({valid: ['0042', 'DEADbeef'], invalid: ['xyz', '']}),
    },
  },
};
