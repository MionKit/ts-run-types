// URL format adapter test. Standard / http / file variants + the
// typeErrors shape.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {FormatUrl, FormatUrlHttp, FormatUrlFile} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

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
