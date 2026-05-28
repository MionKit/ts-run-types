// StringFormat — base string-format type. Branded strings with
// length constraints (and, in subsequent phases, allowed/disallowed
// characters, patterns, transformers). Mirrors mion's
// StringRunTypeFormat (packages/type-formats/src/string/stringFormat.runtype.ts)
// minus the JIT-emit methods — those live in the Go binary now
// (internal/compiled/typefns/formats/string/stringformat.go).
//
// `TypeFormat` IS imported (not `import type`): the value-level
// import keeps the brand alias's reflection metadata reachable for
// tsgo. Mion documents this same constraint in their CLAUDE.md.

import {
  BaseRunTypeFormat,
  registerTypeFormat,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation, FormatPattern} from '@mionjs/ts-go-run-types';

// PatternParam — the regex a string format validates against. The one
// user-facing way to supply a pattern is `registerFormatPattern(...)`,
// whose result (a FormatPattern) goes here:
//
//   const slug = registerFormatPattern({regexp: /^[a-z-]+$/, mockSamples: ['a-b']});
//   type Slug = FormatString<{pattern: typeof slug}>;
//
// (The built-in formats encode their pattern as an inline string-literal
// `{source, flags}` object instead — necessary because a published
// .d.ts can't carry a regex VALUE for `typeof` recovery — but that form
// is internal to this package, defined via TypeFormat directly so it
// doesn't widen the public StringParams surface.)
export type PatternParam = FormatPattern;

// Samples — canonical valid values for the mock generator: either an
// explicit list, or (for char-class params) a string of sample chars.
export type Samples = string | readonly string[];

// AllowedCharsParam — `allowedChars`: the value must consist entirely
// of `val`'s characters (regex `^[val]+$`). `ignoreCase` adds the `i`
// flag; `errorMessage` overrides the default diagnostic.
export interface AllowedCharsParam {
  val: string;
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples?: Samples;
}

// DisallowedCharsParam — `disallowedChars`: the value must contain NONE
// of `val`'s characters. A negative constraint can't be reversed into a
// value, so `mockSamples` (a string of sample chars) is required.
export interface DisallowedCharsParam {
  val: string;
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples: string;
}

// AllowedValuesParam — `allowedValues`: the value must be exactly one of
// `val` (enum-like). Capped at 100 entries by validateParams.
export interface AllowedValuesParam {
  val: readonly string[];
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples?: Samples;
}

// DisallowedValuesParam — `disallowedValues`: the value must be none of
// `val`. Negative constraint ⇒ `mockSamples` required.
export interface DisallowedValuesParam {
  val: readonly string[];
  ignoreCase?: boolean;
  errorMessage?: string;
  desc?: string;
  mockSamples: Samples;
}

// StringParams — the wire-serialisable params shape for FormatString.
export interface StringParams {
  // maxLength — fail when value.length > maxLength.
  maxLength?: number;
  // minLength — fail when value.length < minLength.
  minLength?: number;
  // length — fail when value.length !== length. Mutually exclusive
  // with maxLength / minLength (enforced by validateParams).
  length?: number;
  // pattern — a regex the value must match. Backs FormatAlpha /
  // FormatNumeric and any user FormatString carrying a pattern.
  pattern?: PatternParam;
  // allowedChars / disallowedChars — char-class constraints. Mutually
  // exclusive with pattern and the *Values params (validateParams).
  allowedChars?: AllowedCharsParam;
  disallowedChars?: DisallowedCharsParam;
  // allowedValues / disallowedValues — enum-like exact-match sets.
  allowedValues?: AllowedValuesParam;
  disallowedValues?: DisallowedValuesParam;
  // mockSamples — canonical valid values for the mock generator (a
  // regex can't be reversed into a value). REQUIRED whenever `pattern`
  // is set; each sample is validated against the pattern at build time
  // (diagnostic FMT001 on mismatch).
  mockSamples?: readonly string[];
  // Transformer flags — applied only by a `format` pass, NOT by
  // isType / typeErrors validation. Carried here so the
  // FormatLowercase / FormatUppercase / FormatCapitalize aliases are
  // type-clean and a future format-transform RT fn can read them.
  lowercase?: boolean;
  uppercase?: boolean;
  capitalize?: boolean;
}

// FormatString — the branded string alias users put in their type
// annotations: `FormatString<{maxLength: 32}>`. The `BrandName`
// parameter follows mion's convention so consumers can produce
// nominal types when needed (`FormatString<{minLength: 1},
// 'NonEmpty'>` → distinct from a plain `string` even when the
// validator allows the same values).
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type FormatString<P extends StringParams = {}, BrandName extends string = never> = TypeFormat<
  string,
  'stringFormat',
  P,
  BrandName
>;

// StringRunTypeFormat — runtime-side RunTypeFormat. The JIT-emit
// surface (emitIsType / emitTypeErrors) is intentionally absent —
// the Go-side stringFormatEmitter owns that. Subclass only needs to
// implement `_mock` and `validateParams`.
export class StringRunTypeFormat extends BaseRunTypeFormat<StringParams> {
  static readonly id = 'stringFormat' as const;
  readonly name = StringRunTypeFormat.id;
  readonly kind = RunTypeKind.string;

  // _mock draws from mockSamples when present (the only safe source
  // for a pattern-constrained format — a regex can't be reversed),
  // else generates a random string of the bounded length. Runs only
  // under createMockType, never during validation.
  _mock(annotation: FormatAnnotation<StringParams>): string {
    const params = annotation.params ?? {};
    // allowedValues — the value must be exactly one of the listed values.
    if (params.allowedValues) return pickSample(params.allowedValues.val) ?? '';
    // Sample-backed: a regex / negative constraint can't be reversed, so
    // draw from explicit samples. Top-level first, then the pattern
    // bundle, then disallowedValues' samples.
    const sample = pickSample(
      params.mockSamples ??
        (params.pattern as {mockSamples?: readonly string[]} | undefined)?.mockSamples ??
        toSampleList(params.disallowedValues?.mockSamples),
    );
    if (sample !== undefined) return sample;
    // Char-set backed: build a random string from the allowed character
    // set (or, for disallowedChars, the explicitly-sampled char set) so
    // the result matches the `^[…]+$` predicate the validator emits.
    const charSet = params.allowedChars?.val ?? asCharString(params.disallowedChars?.mockSamples);
    if (charSet) return randomStringFrom(charSet, Math.max(1, pickMockLength(params)));
    // A pattern with no samples can't be reversed into a valid value —
    // the random fallback would fail the pattern. Fail loudly rather
    // than hand back invalid data (registerFormatPattern requires
    // samples; this guards the raw type-first `FormatString<{pattern}>`).
    if (params.pattern !== undefined) {
      throw new Error('StringFormat: a `pattern` requires `mockSamples` to mock — none provided.');
    }
    return randomString(pickMockLength(params));
  }

  // validateParams asserts the cross-param invariants mion's
  // StringRunTypeFormat checks: `length` is mutually exclusive with
  // `maxLength`/`minLength`, and `minLength` must not exceed
  // `maxLength`. Throws on violation so misconfigured types fail
  // loudly at cache-build time rather than producing a silently
  // unreachable validator.
  validateParams(annotation: FormatAnnotation<StringParams>): void {
    const params = annotation.params ?? {};
    if (params.length !== undefined && (params.maxLength !== undefined || params.minLength !== undefined)) {
      throw new Error('StringFormat: `length` cannot be combined with `maxLength` or `minLength`');
    }
    if (
      params.maxLength !== undefined &&
      params.minLength !== undefined &&
      params.maxLength < params.minLength
    ) {
      throw new Error('StringFormat: `maxLength` cannot be less than `minLength`');
    }
    if (params.allowedValues && params.allowedValues.val.length > 100) {
      throw new Error('StringFormat: `allowedValues` cannot have more than 100 values');
    }
    if (params.disallowedValues && params.disallowedValues.val.length > 100) {
      throw new Error('StringFormat: `disallowedValues` cannot have more than 100 values');
    }
    // Only one matching strategy at a time — combining a pattern with a
    // char/value set produces contradictory predicates ANDed together.
    const complex = (['pattern', 'allowedChars', 'disallowedChars', 'allowedValues', 'disallowedValues'] as const).filter(
      (name) => params[name] !== undefined,
    );
    if (complex.length > 1) {
      throw new Error(
        'StringFormat: only one of [pattern, allowedChars, disallowedChars, allowedValues, disallowedValues] can be used at once',
      );
    }
    // Negative constraints can't be reversed into a mock — require samples.
    if (params.disallowedChars && !params.disallowedChars.mockSamples) {
      throw new Error('StringFormat: `disallowedChars` requires `mockSamples`');
    }
    if (params.disallowedValues && !params.disallowedValues.mockSamples) {
      throw new Error('StringFormat: `disallowedValues` requires `mockSamples`');
    }
  }
}

// pickSample returns a random entry from a non-empty samples list, or
// undefined when there are none. Shared by every sample-backed format.
export function pickSample(samples: readonly string[] | undefined): string | undefined {
  if (!samples || samples.length === 0) return undefined;
  return samples[Math.floor(Math.random() * samples.length)];
}

// toSampleList normalises a Samples (string | string[]) into an array
// so pickSample can draw from it. A bare string becomes a single-entry
// list (it's a full sample value, not a char set).
function toSampleList(samples: Samples | undefined): readonly string[] | undefined {
  if (samples === undefined) return undefined;
  return typeof samples === 'string' ? [samples] : samples;
}

// asCharString returns the sample only when it's a char-set string (the
// disallowedChars mock source), else undefined.
function asCharString(samples: Samples | undefined): string | undefined {
  return typeof samples === 'string' ? samples : undefined;
}

// randomStringFrom builds a length-N string drawn from `chars`.
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
  for (let i = 0; i < length; i++) {
    out += MOCK_CHARS[Math.floor(Math.random() * MOCK_CHARS.length)];
  }
  return out;
}

// Side-effect registration: importing this module registers the
// formatter with the runtime registry. Consumers that only want the
// type alias (`import type {FormatString}`) get the registration
// transparently via the value-level type re-export in StringFormats.ts.
registerTypeFormat(new StringRunTypeFormat());
