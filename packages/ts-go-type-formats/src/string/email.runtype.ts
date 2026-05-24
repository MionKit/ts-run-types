// Email format — FormatEmail and the strict / punycode variants. AOT
// divergence noted in email.go: a variant selects the baked-in regex.
// isType / typeErrors emit lives in
// internal/compiled/typefns/formats/string/email.go.

import {
  BaseRunTypeFormat,
  registerFormatter,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';

export interface FormatParams_Email {
  variant?: 'standard' | 'punycode';
  maxLength?: number;
  minLength?: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatEmail<P extends FormatParams_Email = {}> = TypeFormat<string, 'email', P, 'email'>;
export type FormatEmailPunycode = FormatEmail<{variant: 'punycode'}>;
// Strict caps the overall length tighter than the spec maximum.
export type FormatEmailStrict = FormatEmail<{maxLength: 254; minLength: 7}>;

const SAMPLE_NAMES = ['john', 'jane', 'admin', 'hello', 'contact', 'user'];
const SAMPLE_DOMAINS = ['example.com', 'mion.io', 'test.org', 'mail.net'];

export class EmailRunTypeFormat extends BaseRunTypeFormat<FormatParams_Email> {
  static readonly id = 'email' as const;
  readonly name = EmailRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(_annotation: FormatAnnotation<FormatParams_Email>): string {
    const name = SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];
    const domain = SAMPLE_DOMAINS[Math.floor(Math.random() * SAMPLE_DOMAINS.length)];
    return `${name}@${domain}`;
  }

  validateParams(annotation: FormatAnnotation<FormatParams_Email>): void {
    const params = annotation.params ?? {};
    if (params.maxLength !== undefined && params.maxLength > 254) {
      throw new Error('Email maxLength cannot be greater than 254');
    }
    if (params.minLength !== undefined && params.minLength < 7) {
      throw new Error('Email minLength cannot be less than 7');
    }
  }
}

registerFormatter(new EmailRunTypeFormat());
