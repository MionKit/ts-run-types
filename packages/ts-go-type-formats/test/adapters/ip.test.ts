// IP-address format adapter test. Covers v4, v6, the version='any'
// OR path, port handling, and localhost gating.

import {describe, expect, it} from 'vitest';
import {createIsType, createGetTypeErrors} from '@mionjs/ts-go-run-types';
import type {FormatIPv4, FormatIPv6, FormatIP, FormatIPv4WithPort, FormatIPv6WithPort} from '@mionjs/ts-go-type-formats';
import '../../src/index.ts';

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
    const formatErr = errors.find((entry) => 'name' in entry && entry.name === 'ip') as
      | {name: string; val: unknown}
      | undefined;
    expect(formatErr).toBeDefined();
    expect(formatErr?.val).toBe(4);
  });

  it('valid IP yields no errors', () => {
    const collect = createGetTypeErrors<FormatIPv4>();
    expect(collect('192.168.0.1')).toEqual([]);
  });
});
