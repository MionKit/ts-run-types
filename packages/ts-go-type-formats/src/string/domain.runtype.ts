// Domain-name format — FormatDomain and the unicode / punycode
// variants. Pattern-based (mion's DEFAULT_DOMAIN_PARAMS shape): the
// regex source is carried as a string-literal type (`.d.ts`-safe — a
// published declaration file can't preserve a regex VALUE), and
// mockSamples supply the mock generator with canonical valid values.
// isType / typeErrors emit + build-time sample validation live in
// internal/compiled/typefns/formats/string/domain.go.

import {
  BaseRunTypeFormat,
  registerFormatter,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';
import {pickSample} from './stringFormat.runtype.ts';

// Regex sources as string-literal types (escaped for the .d.ts).
// Mirror mion's DOMAIN_PATTERN / *_UNICODE / *_PUNYCODE.
type DOMAIN_SRC = '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,63}$';
type DOMAIN_UNICODE_SRC = '^(?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?\\.)+[a-zA-Z]{2,63}$';
type DOMAIN_PUNYCODE_SRC = '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z0-9-]{2,63}$';

type DOMAIN_SAMPLES = ['mion.io', 'example.com', 'mionkit.io', 'sub.example.co.uk', 'wiki.org'];

export interface FormatParams_Domain {
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
}

export type FormatDomain = TypeFormat<
  string,
  'domain',
  {pattern: {source: DOMAIN_SRC; flags: ''}; mockSamples: DOMAIN_SAMPLES; maxLength: 253; minLength: 5},
  'domain'
>;
export type FormatDomainUnicode = TypeFormat<
  string,
  'domain',
  {pattern: {source: DOMAIN_UNICODE_SRC; flags: 'u'}; mockSamples: DOMAIN_SAMPLES; maxLength: 253; minLength: 5},
  'domain'
>;
export type FormatDomainPunycode = TypeFormat<
  string,
  'domain',
  {pattern: {source: DOMAIN_PUNYCODE_SRC; flags: ''}; mockSamples: ['xn--e1afmkfd.xn--p1ai', 'example.com']; maxLength: 253; minLength: 5},
  'domain'
>;

export class DomainRunTypeFormat extends BaseRunTypeFormat<FormatParams_Domain> {
  static readonly id = 'domain' as const;
  readonly name = DomainRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(annotation: FormatAnnotation<FormatParams_Domain>): string {
    return pickSample(annotation.params?.mockSamples) ?? 'example.com';
  }

  // validateParams: build-time mockSample-vs-pattern checking is done
  // Go-side (diagnostic FMT001); nothing extra to assert here.
  validateParams(): void {}
}

registerFormatter(new DomainRunTypeFormat());
