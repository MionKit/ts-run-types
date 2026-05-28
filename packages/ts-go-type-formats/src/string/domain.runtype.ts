// Domain-name format — FormatDomain and the unicode / punycode /
// strict variants. AOT divergence from mion noted in domain.go +
// type-formats-pure-fns.ts: the variant selects a baked-in regex
// rather than carrying a raw RegExp param. isType / typeErrors emit
// lives in internal/compiled/typefns/formats/string/domain.go.

import {
  BaseRunTypeFormat,
  registerFormatter,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';

export interface FormatParams_Domain {
  variant?: 'standard' | 'unicode' | 'punycode';
  maxLength?: number;
  minLength?: number;
  maxParts?: number;
  minParts?: number;
}

// FormatDomain — standard latin domain by default. Variants pin the
// regex family; the *Strict alias adds part-count bounds.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatDomain<P extends FormatParams_Domain = {}> = TypeFormat<string, 'domain', P, 'domain'>;
export type FormatDomainUnicode = FormatDomain<{variant: 'unicode'}>;
export type FormatDomainPunycode = FormatDomain<{variant: 'punycode'}>;
export type FormatDomainStrict = FormatDomain<{maxParts: 6; minParts: 2}>;

const SAMPLE_TLDS = ['com', 'org', 'net', 'io', 'app', 'co', 'dev'];
const SAMPLE_NAMES = ['example', 'mion', 'ggle', 'fbook', 'wiki', 'hello', 'world'];

export class DomainRunTypeFormat extends BaseRunTypeFormat<FormatParams_Domain> {
  static readonly id = 'domain' as const;
  readonly name = DomainRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(annotation: FormatAnnotation<FormatParams_Domain>): string {
    const params = annotation.params ?? {};
    const minParts = params.minParts ?? 2;
    const tld = SAMPLE_TLDS[Math.floor(Math.random() * SAMPLE_TLDS.length)];
    const partCount = Math.max(minParts - 1, 1);
    const names: string[] = [];
    for (let i = 0; i < partCount; i++) {
      names.push(SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)]);
    }
    return `${names.join('.')}.${tld}`;
  }

  validateParams(annotation: FormatAnnotation<FormatParams_Domain>): void {
    const params = annotation.params ?? {};
    if (params.maxLength !== undefined && params.maxLength > 253) {
      throw new Error('Domain maxLength cannot be greater than 253');
    }
    if (params.minLength !== undefined && params.minLength < 3) {
      throw new Error('Domain minLength cannot be less than 3');
    }
    if (params.minParts !== undefined && params.minParts < 2) {
      throw new Error('Domain minParts cannot be less than 2');
    }
    if (params.maxParts !== undefined && params.maxParts < 2) {
      throw new Error('Domain maxParts cannot be less than 2');
    }
  }
}

registerFormatter(new DomainRunTypeFormat());
