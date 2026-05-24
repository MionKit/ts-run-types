// Centralised regex patterns for the built-in string formats. Each is
// registered via registerFormatPattern with a real `/regex/` literal,
// which validates the mockSamples against the actual JS engine at module
// load (catching a sample that contradicts its own pattern). Formats
// reference these by `typeof` (see stringFormats.ts); the Go scanner
// recovers {source, flags, mockSamples} from the regex literal in the
// call's AST.
//
// Note: like every `typeof`-recovered pattern, these resolve from package
// SOURCE (the regex literal). A published `.d.ts` erases the regex value,
// so the consumer-facing recovery story is handled separately (shipping
// the pattern through the runtypes cache) — not yet wired.

import {registerFormatPattern} from '../../runtypes/formatPattern.ts';

// Latin domain: each label ≤63 chars, tld 2-63 latin letters.
export const DOMAIN_PATTERN = registerFormatPattern({
  regexp: /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,63}$/,
  mockSamples: ['mion.io', 'example.com', 'mionkit.io', 'sub.example.co.uk', 'wiki.org'],
});

// Unicode domain (labels allow \p{L}\p{N}); tld stays latin.
export const DOMAIN_UNICODE_PATTERN = registerFormatPattern({
  regexp: /^(?:[\p{L}\p{N}](?:[\p{L}\p{N}-]{0,61}[\p{L}\p{N}])?\.)+[a-zA-Z]{2,63}$/u,
  mockSamples: ['mion.io', 'example.com', 'mionkit.io', 'sub.example.co.uk', 'wiki.org'],
});

// Punycode domain: tld may contain digits/hyphens (xn--…).
export const DOMAIN_PUNYCODE_PATTERN = registerFormatPattern({
  regexp: /^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z0-9-]{2,63}$/,
  mockSamples: ['xn--e1afmkfd.xn--p1ai', 'example.com'],
});

// Strict-domain label / tld sub-patterns (used by FormatDomainStrict).
export const DOMAIN_NAME_PATTERN = registerFormatPattern({
  regexp: /^[a-zA-Z0-9-]+$/,
  mockSamples: ['domain', 'mion', 'example', 'wiki', 'mionkit'],
});
export const DOMAIN_TLD_PATTERN = registerFormatPattern({
  regexp: /^[a-zA-Z]+(\.[a-zA-Z]+)?$/,
  mockSamples: ['com', 'org', 'net', 'io'],
});

// Email (latin-label domains; tld stays latin) + punycode variant.
export const EMAIL_PATTERN = registerFormatPattern({
  regexp: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z]{2,63}$/,
  mockSamples: ['john@example.com', 'jane.doe@mion.io', 'contact@test.org'],
});
export const EMAIL_PUNYCODE_PATTERN = registerFormatPattern({
  regexp: /^[^\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\.)+[a-zA-Z0-9-]{2,63}$/,
  mockSamples: ['john@example.xn--fiqs8s'],
});

// URL — http/ftp/ws schemes, http-only, and file:// (unix-style paths).
export const URL_PATTERN = registerFormatPattern({
  regexp: /^(?:https?|ftps?|wss?):\/\/[^\s/$.?#-][^\s]*$/i,
  mockSamples: ['https://example.com', 'http://mion.io/path', 'ftp://files.example.org'],
});
export const URL_HTTP_PATTERN = registerFormatPattern({
  regexp: /^https?:\/\/[^\s/$.?#-][^\s]*$/i,
  mockSamples: ['https://example.com', 'http://mion.io/a/b'],
});
export const URL_FILE_PATTERN = registerFormatPattern({
  regexp: /^file:\/\/\/?(?:[a-zA-Z]:)?[^\s/$.?#-][^\s]*$/i,
  mockSamples: ['file:///etc/hosts', 'file:///var/log/app.log'],
});

// Default char-class formats (Alpha / AlphaNumeric / Numeric).
export const ALPHA_PATTERN = registerFormatPattern({
  regexp: /^[\p{L}]+$/u,
  mockSamples: ['abc', 'Hello', 'World'],
});
export const ALPHANUMERIC_PATTERN = registerFormatPattern({
  regexp: /^[\p{L}\p{N}]+$/u,
  mockSamples: ['abc123', 'Test42', 'XYZ0'],
});
export const NUMERIC_PATTERN = registerFormatPattern({
  regexp: /^[\p{N}]+$/u,
  mockSamples: ['123', '007', '42'],
});
