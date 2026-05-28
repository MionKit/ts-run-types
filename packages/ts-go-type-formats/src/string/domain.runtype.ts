// Domain-name format — FormatDomain (pattern-based) and
// FormatDomainStrict (names/tld decomposition). The pattern variants
// carry the regex source as a string-literal type (`.d.ts`-safe — a
// published declaration file can't preserve a regex VALUE). The strict
// variant carries `names`/`tld` sub-formats: the value is split on '.'
// and each label + the tld is validated as a sub-StringFormat, with
// maxParts/minParts and hyphen-edge checks. isType / typeErrors emit +
// build-time sample validation live in
// internal/compiled/typefns/formats/string/domain.go.

import {
  BaseRunTypeFormat,
  registerTypeFormat,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';
import {pickSample} from './stringFormat.runtype.ts';
import type {
  AllowedValuesParam,
  DisallowedValuesParam,
  PatternParam,
  Samples,
} from './stringFormat.runtype.ts';

// Regex sources as string-literal types (escaped for the .d.ts).
// Mirror mion's DOMAIN_PATTERN / *_UNICODE / *_PUNYCODE.
type DOMAIN_SRC = '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z]{2,63}$';
type DOMAIN_UNICODE_SRC = '^(?:[\\p{L}\\p{N}](?:[\\p{L}\\p{N}-]{0,61}[\\p{L}\\p{N}])?\\.)+[a-zA-Z]{2,63}$';
type DOMAIN_PUNYCODE_SRC = '^(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\\.)+[a-zA-Z0-9-]{2,63}$';

type DOMAIN_SAMPLES = ['mion.io', 'example.com', 'mionkit.io', 'sub.example.co.uk', 'wiki.org'];

// DomainPartParams — the sub-validators a `names` label or the `tld`
// accepts (mion FormatParams_DomainName / _Tld =
// Omit<StringValidators, 'length' | 'allowedChars' | 'disallowedChars'>).
export interface DomainPartParams {
  maxLength?: number;
  minLength?: number;
  // pattern — a FormatPattern (registerFormatPattern) for user domains,
  // or an inline {source, flags} for the built-in strict defaults.
  pattern?: PatternParam | {source: string; flags?: string};
  allowedValues?: AllowedValuesParam;
  disallowedValues?: DisallowedValuesParam;
  mockSamples?: Samples;
}

// FormatParams_Domain — the wire params for a domain. Either the
// pattern path (a single baked regex) or the decomposition path
// (names + tld), never both (mion validateParams enforces it).
export interface FormatParams_Domain {
  maxLength?: number;
  minLength?: number;
  maxParts?: number;
  minParts?: number;
  pattern?: {source: string; flags?: string} | {val: RegExp};
  mockSamples?: readonly string[];
  names?: DomainPartParams;
  tld?: DomainPartParams;
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

// Strict-domain default params (mion DEFAULT_STRICT_DOMAIN_PARAMS).
// names/tld carry inline string-literal pattern sources (the same
// `.d.ts`-safe encoding the built-in FormatAlpha uses), so they live as
// a standalone type rather than through the public FormatPattern surface.
type STRICT_NAME_SRC = '^[a-zA-Z0-9-]+$';
type STRICT_TLD_SRC = '^[a-zA-Z]+(\\.[a-zA-Z]+)?$';
export type DEFAULT_STRICT_DOMAIN_PARAMS = {
  maxParts: 6;
  minParts: 2;
  maxLength: 253;
  minLength: 5;
  names: {
    maxLength: 63;
    minLength: 2;
    pattern: {source: STRICT_NAME_SRC; flags: ''};
    mockSamples: ['domain', 'mion', 'example', 'wiki', 'mionkit'];
  };
  tld: {
    maxLength: 12;
    minLength: 2;
    pattern: {source: STRICT_TLD_SRC; flags: ''};
    mockSamples: ['com', 'org', 'net', 'io'];
  };
};

// FormatDomainStrict — domain validated by decomposition: ≤6 labels,
// ≥2 parts, each label matches [a-zA-Z0-9-] with no leading/trailing
// hyphen, tld is alphabetical.
export type FormatDomainStrict = TypeFormat<string, 'domain', DEFAULT_STRICT_DOMAIN_PARAMS, 'domain'>;

export class DomainRunTypeFormat extends BaseRunTypeFormat<FormatParams_Domain> {
  static readonly id = 'domain' as const;
  readonly name = DomainRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  // _mock builds `<name>.<tld>` from the sub-format samples on the
  // decomposition path, else draws a whole-domain sample.
  _mock(annotation: FormatAnnotation<FormatParams_Domain>): string {
    const params = annotation.params ?? {};
    if (params.names || params.tld) {
      const name = pickSample(asList(params.names?.mockSamples)) ?? 'example';
      const tld = pickSample(asList(params.tld?.mockSamples)) ?? 'com';
      return `${name}.${tld}`;
    }
    return pickSample(params.mockSamples) ?? 'example.com';
  }

  // validateParams: build-time mockSample-vs-pattern checking is done
  // Go-side (diagnostic FMT001); nothing extra to assert here.
  validateParams(): void {}
}

// asList coerces a Samples (string | string[]) into an array for
// pickSample; a bare string is treated as one sample.
function asList(samples: Samples | undefined): readonly string[] | undefined {
  if (samples === undefined) return undefined;
  return typeof samples === 'string' ? [samples] : samples;
}

registerTypeFormat(new DomainRunTypeFormat());
