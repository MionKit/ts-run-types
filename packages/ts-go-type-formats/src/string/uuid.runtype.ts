// UUID format — FormatUUIDv4 / FormatUUIDv7. Mirrors mion's
// UUIDRunTypeFormat (packages/type-formats/src/string/uuid.runtype.ts).
// The isType / typeErrors emit lives in the Go binary
// (internal/compiled/typefns/formats/string/uuid.go); the runtime
// class only carries `_mock` + `validateParams`.

import {
  BaseRunTypeFormat,
  registerTypeFormat,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';

// FormatParams_UUID — the version-pin params object. mion supports
// '4' and '7'; validateParams rejects anything else.
export interface FormatParams_UUID {
  version: '4' | '7';
}

// FormatUUIDv4 / FormatUUIDv7 — branded string aliases users place in
// type annotations. Both pin the format name 'uuid' and the brand
// 'uuid' so two UUID variants stay nominally distinct from a plain
// string and from each other.
export type FormatUUIDv4 = TypeFormat<string, 'uuid', {version: '4'}, 'uuid'>;
export type FormatUUIDv7 = TypeFormat<string, 'uuid', {version: '7'}, 'uuid'>;

export class UUIDRunTypeFormat extends BaseRunTypeFormat<FormatParams_UUID> {
  static readonly id = 'uuid' as const;
  readonly name = UUIDRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(annotation: FormatAnnotation<FormatParams_UUID>): string {
    const version = annotation.params?.version ?? '4';
    return version === '7' ? randomUUIDv7() : randomUUIDv4();
  }

  validateParams(annotation: FormatAnnotation<FormatParams_UUID>): void {
    const version = annotation.params?.version;
    if (version !== '4' && version !== '7') {
      throw new Error(`Invalid UUID version: ${String(version)}, must be either '4' or '7'`);
    }
  }
}

// randomUUIDv4 — prefers the platform crypto when available, falls
// back to a Math.random-seeded generator for environments without it
// (mock values never need cryptographic strength).
function randomUUIDv4(): string {
  const globalCrypto = (globalThis as {crypto?: {randomUUID?: () => string}}).crypto;
  if (globalCrypto?.randomUUID) return globalCrypto.randomUUID();
  return template().replace(/[xy]/g, (char) => {
    const rand = (Math.random() * 16) | 0;
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });
}

// randomUUIDv7 — time-ordered UUID. 48-bit big-endian timestamp
// prefix + version nibble 7 + variant bits + random tail. Sufficient
// for mock generation; not a spec-perfect monotonic generator.
function randomUUIDv7(): string {
  const now = Date.now();
  const timeHex = now.toString(16).padStart(12, '0');
  const rand = () => Math.floor(Math.random() * 16).toString(16);
  let tail = '';
  for (let i = 0; i < 16; i++) tail += rand();
  const hex = (timeHex + '7' + tail).slice(0, 32);
  // Force the variant bits (slot 16) into the 8-b range.
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const full = hex.slice(0, 16) + variant + hex.slice(17);
  return `${full.slice(0, 8)}-${full.slice(8, 12)}-${full.slice(12, 16)}-${full.slice(16, 20)}-${full.slice(20, 32)}`;
}

function template(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx';
}

registerTypeFormat(new UUIDRunTypeFormat());
