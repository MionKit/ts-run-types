// Single mock entry point for every string format. Registered once for
// ReflectionKind.string via `registerMockingFunction`; the mock walker
// calls it with the FormatAnnotation and dispatches on the format name.
// Replaces the old per-format `_mock` classes (the project's class→switch
// convention). The value-transform (lowercase/trim) is applied by the
// mock walker AFTER this returns, so these produce the base valid value.

import {registerMockingFunction} from './mockRegistry.ts';
import {RunTypeKind} from '../runTypeKind.ts';
import type {FormatAnnotation} from '../runtypes/formatAnnotation.ts';
import type {
  DateFmt,
  FormatParams_Date,
  FormatParams_DateTime,
  FormatParams_Domain,
  FormatParams_Email,
  FormatParams_IP,
  FormatParams_Time,
  FormatParams_UUID,
  Samples,
  StringParams,
  TimeFmt,
} from '../formats/string/stringFormats.ts';

// mockStringFormat dispatches on the format name. Returns undefined for
// an unrecognised name so the mock walker falls back to the kind-default
// (a plain random string).
function mockStringFormat(annotation: FormatAnnotation): unknown {
  const params = annotation.params ?? {};
  switch (annotation.name) {
    case 'stringFormat':
      return mockStringParams(params as StringParams);
    case 'uuid':
      return mockUuid(params as Partial<FormatParams_UUID>);
    case 'date':
      return mockDateLayout((params as Partial<FormatParams_Date>).format ?? 'ISO');
    case 'time':
      return mockTimeLayout((params as Partial<FormatParams_Time>).format ?? 'ISO');
    case 'dateTime':
      return mockDateTime(params as Partial<FormatParams_DateTime>);
    case 'ip':
      return mockIp(params as Partial<FormatParams_IP>);
    case 'domain':
      return mockDomain(params as FormatParams_Domain);
    case 'email':
      return mockEmail(params as FormatParams_Email);
    case 'url':
      return pickSample((params as {mockSamples?: readonly string[]}).mockSamples) ?? 'https://example.com';
    default:
      return undefined;
  }
}

registerMockingFunction(RunTypeKind.string, mockStringFormat);

// ─────────────────────────── StringFormat ───────────────────────────

function mockStringParams(params: StringParams): string {
  if (params.allowedValues) return pickSample(params.allowedValues.val) ?? '';
  const sample = pickSample(
    params.mockSamples ??
      (params.pattern as {mockSamples?: readonly string[]} | undefined)?.mockSamples ??
      toSampleList(params.disallowedValues?.mockSamples)
  );
  if (sample !== undefined) return sample;
  const charSet = params.allowedChars?.val ?? asCharString(params.disallowedChars?.mockSamples);
  if (charSet) return randomStringFrom(charSet, Math.max(1, pickMockLength(params)));
  if (params.pattern !== undefined) {
    throw new Error('StringFormat: a `pattern` requires `mockSamples` to mock — none provided.');
  }
  return randomString(pickMockLength(params));
}

// pickSample returns a random entry from a non-empty list, else undefined.
export function pickSample(samples: readonly string[] | undefined): string | undefined {
  if (!samples || samples.length === 0) return undefined;
  return samples[Math.floor(Math.random() * samples.length)];
}

function toSampleList(samples: Samples | undefined): readonly string[] | undefined {
  if (samples === undefined) return undefined;
  return typeof samples === 'string' ? [samples] : samples;
}

function asCharString(samples: Samples | undefined): string | undefined {
  return typeof samples === 'string' ? samples : undefined;
}

function randomStringFrom(chars: string, length: number): string {
  if (chars.length === 0) return '';
  let out = '';
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

function pickMockLength(params: StringParams): number {
  if (params.length !== undefined) return params.length;
  if (params.maxLength !== undefined && params.minLength !== undefined) {
    return randomInt(params.minLength, params.maxLength);
  }
  if (params.maxLength !== undefined) return randomInt(0, params.maxLength);
  if (params.minLength !== undefined) return randomInt(params.minLength, params.minLength + 8);
  return randomInt(1, 16);
}

function randomInt(min: number, max: number): number {
  if (max < min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

const MOCK_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function randomString(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += MOCK_CHARS[Math.floor(Math.random() * MOCK_CHARS.length)];
  return out;
}

// ─────────────────────────────── UUID ───────────────────────────────

function mockUuid(params: Partial<FormatParams_UUID>): string {
  return (params.version ?? '4') === '7' ? randomUUIDv7() : randomUUIDv4();
}

function randomUUIDv4(): string {
  const globalCrypto = (globalThis as {crypto?: {randomUUID?: () => string}}).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

function randomUUIDv7(): string {
  // 32 hex nibbles: 48-bit ms timestamp (12) + version '7' (1) +
  // rand_a (3) + variant nibble (1) + rand_b (15).
  const timeHex = Date.now().toString(16).padStart(12, '0').slice(-12);
  const randHex = (count: number): string => {
    let out = '';
    for (let i = 0; i < count; i++) out += Math.floor(Math.random() * 16).toString(16);
    return out;
  };
  const variant = ((Math.floor(Math.random() * 16) & 0x3) | 0x8).toString(16);
  const full = timeHex + '7' + randHex(3) + variant + randHex(15);
  return `${full.slice(0, 8)}-${full.slice(8, 12)}-${full.slice(12, 16)}-${full.slice(16, 20)}-${full.slice(20, 32)}`;
}

// ──────────────────────────── Date / Time ───────────────────────────

function maxDaysInMonth(year: number, month: number): number {
  if (month === 2) return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function mockDateLayout(format: DateFmt): string {
  const yy = Math.floor(Math.random() * 9999) + 1;
  const mm = Math.floor(Math.random() * 12) + 1;
  const dd = Math.floor(Math.random() * maxDaysInMonth(yy, mm)) + 1;
  const year = String(yy).padStart(4, '0');
  const month = String(mm).padStart(2, '0');
  const day = String(dd).padStart(2, '0');
  switch (format) {
    case 'DD-MM-YYYY':
      return `${day}-${month}-${year}`;
    case 'MM-DD-YYYY':
      return `${month}-${day}-${year}`;
    case 'YYYY-MM':
      return `${year}-${month}`;
    case 'MM-DD':
      return `${month}-${day}`;
    case 'DD-MM':
      return `${day}-${month}`;
    default: // ISO / YYYY-MM-DD
      return `${year}-${month}-${day}`;
  }
}

function mockTimeLayout(format: TimeFmt): string {
  const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
  const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  const seconds = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  switch (format) {
    case 'ISO':
    case 'HH:mm:ss[.mmm]TZ':
      return `${hours}:${minutes}:${seconds}${mockMilliseconds()}${mockTimeZone()}`;
    case 'HH:mm:ss[.mmm]':
      return `${hours}:${minutes}:${seconds}${mockMilliseconds()}`;
    case 'HH:mm:ss':
      return `${hours}:${minutes}:${seconds}`;
    case 'HH:mm':
      return `${hours}:${minutes}`;
    case 'mm:ss':
      return `${minutes}:${seconds}`;
    case 'HH':
      return hours;
    case 'mm':
      return minutes;
    case 'ss':
      return seconds;
    default:
      return `${hours}:${minutes}:${seconds}`;
  }
}

function mockMilliseconds(): string {
  if (Math.random() > 0.5) return '';
  return `.${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
}

function mockTimeZone(): string {
  if (Math.random() > 0.5) return 'Z';
  const hours = String(Math.floor(Math.random() * 24)).padStart(2, '0');
  const minutes = String(Math.floor(Math.random() * 60)).padStart(2, '0');
  return `${Math.random() > 0.5 ? '+' : '-'}${hours}:${minutes}`;
}

function mockDateTime(params: Partial<FormatParams_DateTime>): string {
  const splitChar = params.splitChar ?? 'T';
  return `${mockDateLayout(params.date?.format ?? 'ISO')}${splitChar}${mockTimeLayout(params.time?.format ?? 'ISO')}`;
}

// ──────────────────────────────── IP ────────────────────────────────

function mockIp(params: Partial<FormatParams_IP>): string {
  if (params.version === 4) return mockIpV4(params);
  if (params.version === 6) return mockIpV6(params);
  return Math.random() > 0.5 ? mockIpV4(params) : mockIpV6(params);
}

function mockIpV4(params: Partial<FormatParams_IP>): string {
  if (params.allowLocalHost && Math.random() > 0.8) return Math.random() > 0.5 ? 'localhost' : '127:0:0:1';
  return Array.from({length: 4}, () => Math.floor(Math.random() * 256)).join('.');
}

function mockIpV6(params: Partial<FormatParams_IP>): string {
  if (params.allowLocalHost && Math.random() > 0.8) return Math.random() > 0.5 ? '0:0:0:0:0:0:0:1' : '::1';
  return Array.from({length: 8}, () => Math.floor(Math.random() * 0xffff).toString(16)).join(':');
}

// ─────────────────────────── Domain / Email ─────────────────────────

function mockDomain(params: FormatParams_Domain): string {
  if (params.names || params.tld) {
    const name = pickSample(toSampleList(params.names?.mockSamples)) ?? 'example';
    const tld = pickSample(toSampleList(params.tld?.mockSamples)) ?? 'com';
    return `${name}.${tld}`;
  }
  return pickSample(params.mockSamples) ?? 'example.com';
}

function mockEmail(params: FormatParams_Email): string {
  if (params.localPart || params.domain) {
    const local = params.localPart ? mockStringParams(params.localPart) : 'user';
    const domain = params.domain ? mockDomain(params.domain) : 'example.com';
    return `${local}@${domain}`;
  }
  return pickSample(params.mockSamples) ?? 'john@example.com';
}
