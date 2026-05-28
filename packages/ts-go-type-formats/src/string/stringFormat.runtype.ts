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
  registerFormatter,
  RunTypeKind,
  TypeFormat,
} from '@mionjs/ts-go-run-types';
import type {FormatAnnotation} from '@mionjs/ts-go-run-types';

// PatternParam — the regex a string format validates against. Two
// authoring shapes, both recovered to the same source+flags on the Go
// side:
//   - {source, flags}      string literals — .d.ts-safe; what the
//                          built-in formats (domain/email/url/alpha…)
//                          use, since a published .d.ts can't carry a
//                          regex VALUE.
//   - {val: typeof REGEX}  a user's own regex const — recovered from
//                          the declaration AST (works when the const's
//                          source is visible to the compiler).
export type PatternParam = {source: string; flags?: string} | {val: RegExp};

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
    const sample = pickSample(params.mockSamples);
    if (sample !== undefined) return sample;
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
  }
}

// pickSample returns a random entry from a non-empty samples list, or
// undefined when there are none. Shared by every sample-backed format.
export function pickSample(samples: readonly string[] | undefined): string | undefined {
  if (!samples || samples.length === 0) return undefined;
  return samples[Math.floor(Math.random() * samples.length)];
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
registerFormatter(new StringRunTypeFormat());
