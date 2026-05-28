// Email format — FormatEmail and the punycode variant. Pattern-based;
// see domain.runtype.ts for the shape rationale.

import {
  BaseRunTypeFormat,
  registerFormatter,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';
import {pickSample} from './stringFormat.runtype.ts';

// Mirror mion's EMAIL_PATTERN / EMAIL_PATTERN_PUNYCODE.
type EMAIL_SRC = '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z]{2,63}$';
type EMAIL_PUNYCODE_SRC = '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z0-9-]{2,63}$';

type EMAIL_SAMPLES = ['john@example.com', 'jane.doe@mion.io', 'contact@test.org'];

export interface FormatParams_Email {
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
}

export type FormatEmail = TypeFormat<
  string,
  'email',
  {pattern: {source: EMAIL_SRC; flags: ''}; mockSamples: EMAIL_SAMPLES; maxLength: 254; minLength: 7},
  'email'
>;
export type FormatEmailPunycode = TypeFormat<
  string,
  'email',
  {pattern: {source: EMAIL_PUNYCODE_SRC; flags: ''}; mockSamples: ['john@example.xn--fiqs8s']; maxLength: 254; minLength: 7},
  'email'
>;
// Strict is an alias of the default standard email today; kept as a
// distinct public name for forward-compat (tighter rules may land).
export type FormatEmailStrict = FormatEmail;

export class EmailRunTypeFormat extends BaseRunTypeFormat<FormatParams_Email> {
  static readonly id = 'email' as const;
  readonly name = EmailRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  _mock(annotation: FormatAnnotation<FormatParams_Email>): string {
    return pickSample(annotation.params?.mockSamples) ?? 'john@example.com';
  }

  validateParams(): void {}
}

registerFormatter(new EmailRunTypeFormat());
