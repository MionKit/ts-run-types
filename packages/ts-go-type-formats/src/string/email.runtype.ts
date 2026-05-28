// Email format — FormatEmail (pattern-based) and FormatEmailStrict
// (localPart + domain decomposition). The strict variant splits on the
// last '@', validates the local part as a StringFormat (rejecting
// aliasing chars like '+') and the domain as a strict domain. See
// domain.runtype.ts for the shape rationale; the emit lives in
// internal/compiled/typefns/formats/string/email.go.

import {
  BaseRunTypeFormat,
  registerTypeFormat,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';
import {pickSample, StringRunTypeFormat} from './stringFormat.runtype.ts';
import type {StringParams} from './stringFormat.runtype.ts';
import {DomainRunTypeFormat} from './domain.runtype.ts';
import type {DEFAULT_STRICT_DOMAIN_PARAMS, FormatParams_Domain} from './domain.runtype.ts';

// Mirror mion's EMAIL_PATTERN / EMAIL_PATTERN_PUNYCODE.
type EMAIL_SRC = '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z]{2,63}$';
type EMAIL_PUNYCODE_SRC = '^[^\\s@]{1,64}@(?:[a-zA-Z0-9-]{1,63}\\.)+[a-zA-Z0-9-]{2,63}$';

type EMAIL_SAMPLES = ['john@example.com', 'jane.doe@mion.io', 'contact@test.org'];

// FormatParams_Email — pattern path, or localPart + domain
// decomposition (mion FormatParams_Email).
export interface FormatParams_Email {
  maxLength?: number;
  minLength?: number;
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
  localPart?: StringParams;
  domain?: FormatParams_Domain;
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

// Strict-email default params (mion DEFAULT_STRICT_EMAIL_PARAMS). The
// localPart disallows aliasing / structural chars (notably '+' and
// '@'); the domain is a strict (decomposed) domain. mockSamples on the
// disallowedChars is a char set the mock generator draws from.
export type DEFAULT_STRICT_EMAIL_PARAMS = {
  maxLength: 254;
  localPart: {
    maxLength: 64;
    minLength: 1;
    disallowedChars: {
      val: ' ()<>[]:;\\,{}|+@';
      errorMessage: 'Invalid characters in email local part';
      mockSamples: 'abcdefghijklmnopqrstuvwxyz0123456789._-';
    };
  };
  domain: DEFAULT_STRICT_DOMAIN_PARAMS;
};

// FormatEmailStrict — split on the last '@'; local part rejects spaces,
// brackets and aliasing chars; domain validated strictly.
export type FormatEmailStrict = TypeFormat<string, 'email', DEFAULT_STRICT_EMAIL_PARAMS, 'email'>;

export class EmailRunTypeFormat extends BaseRunTypeFormat<FormatParams_Email> {
  static readonly id = 'email' as const;
  readonly name = EmailRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  private readonly stringFmt = new StringRunTypeFormat();
  private readonly domainFmt = new DomainRunTypeFormat();

  // _mock builds `<localPart>@<domain>` from the sub-formats on the
  // decomposition path, else draws a whole-email sample.
  _mock(annotation: FormatAnnotation<FormatParams_Email>): string {
    const params = annotation.params ?? {};
    if (params.localPart || params.domain) {
      const local = params.localPart
        ? this.stringFmt._mock({name: 'stringFormat', params: params.localPart})
        : 'user';
      const domain = params.domain
        ? this.domainFmt._mock({name: 'domain', params: params.domain})
        : 'example.com';
      return `${local}@${domain}`;
    }
    return pickSample(params.mockSamples) ?? 'john@example.com';
  }

  validateParams(): void {}
}

registerTypeFormat(new EmailRunTypeFormat());
