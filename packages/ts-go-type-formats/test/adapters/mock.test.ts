// Format mocking end-to-end. createMockType<Format>() must draw from
// the format's mockSamples (or generate a matching value), and the
// result must pass the corresponding isType validator — the round-trip
// that proves samples + validator + mock all agree.

import {describe, expect, it} from 'vitest';
import {createMockType, createIsType} from '@mionjs/ts-go-run-types';
import type {
  FormatUUIDv4,
  FormatEmail,
  FormatDomain,
  FormatUrl,
  FormatStringDate,
  FormatAlpha,
  FormatNumeric,
} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

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
