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

// StringParams — the wire-serialisable params shape for FormatString.
// Phase 2 ships the length-bound parameters; the JSON-incompatible
// fields (pattern: RegExp, replace: {searchValue: RegExp, ...}) and
// the array-literal-typed fields (allowedValues / disallowedValues)
// land in subsequent phases. Documented per-field so future
// additions slot in cleanly.
export interface StringParams {
  // maxLength — fail when value.length > maxLength.
  maxLength?: number;
  // minLength — fail when value.length < minLength.
  minLength?: number;
  // length — fail when value.length !== length. Mutually exclusive
  // with maxLength / minLength (enforced by validateParams).
  length?: number;
  // charClass — restrict to a unicode character class. Backs the
  // FormatAlpha / FormatAlphaNumeric / FormatNumeric default formats
  // (see defaultStringFormats.runtype.ts). Validated by the
  // cpf_isCharClass pure fn.
  charClass?: 'alpha' | 'alphanumeric' | 'numeric';
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

  // _mock returns a random string of the bounded length. The
  // emit-side validator never observes _mock output (it runs at
  // build time); _mock only matters for `createMockType`, used in
  // tests and tooling.
  _mock(annotation: FormatAnnotation<StringParams>): string {
    const params = annotation.params ?? {};
    const length = pickMockLength(params);
    return randomString(length);
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
