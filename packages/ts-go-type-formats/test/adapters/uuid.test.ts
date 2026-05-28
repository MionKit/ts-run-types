// FormatUUIDv4 / FormatUUIDv7 end-to-end adapter test. Validators are
// built via createIsType / createGetTypeErrors; the Go-side uuidEmitter
// dispatches to the cpf_isUUID pure fn that ships in
// src/type-formats-pure-fns.ts.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {FormatUUIDv4, FormatUUIDv7} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

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
    const formatErr = errors.find((entry) => 'name' in entry && entry.name === 'uuid') as
      | {name: string; val: unknown}
      | undefined;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe('4');
  });

  it('valid UUID yields no errors', () => {
    const collect = createGetTypeErrors<FormatUUIDv4>();
    expect(collect(V4)).toEqual([]);
  });
});
