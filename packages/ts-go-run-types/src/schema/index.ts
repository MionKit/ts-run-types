// Public entry for the `@mionjs/ts-go-run-types/schema` subpath — the value-first
// authoring surface: the leaf/atomic field builders (`string` / `number` /
// `boolean` / `bigint` / `date` / `temporal.*` / `literal` / `regexp` / …), the
// composers (`object` / `array` / `tuple` / `union` / …) and the standard-library
// utility builders. Each builder returns the generic `RunType<…>` node, so
// `typeof object({...})` IS the run-type and `Static<typeof …>` recovers its type.
// Opt-in lane: consumers who want pure type-first reflection never import this.

// Leaf / atomic builders — scalars (`string` / `number` / `boolean` / `bigint`),
// the atomic leaves (`literal` / `regexp` / `symbol`), the top / bottom kinds
// (`any` / `unknown` / `never` / `void`; `voidType` aliased as `void` for a
// natural `RT.void()`), the class-instance builder, and the enum builder
// (`enumType` aliased as `enum` for a natural `RT.enum(MyEnum)`). `brand(name)` is
// the nominal-brand tag for the scalar/date leaf builders (`string({…},
// brand('UserId'))` → `FormatString<P, 'UserId'>`).
export {
  string,
  number,
  boolean,
  bigint,
  brand,
  literal,
  regexp,
  symbol,
  any,
  unknown,
  never,
  voidType,
  voidType as void,
  classType,
  enumType,
  enumType as enum,
} from './atomic.ts';

// Date / time leaf builders — the native JS `Date` builder and the namespaced
// `temporal.*` builders (the 8 TC39 `Temporal` types), grouped in datetime.ts so
// the date/time family reads as a unit.
export {date, temporal} from './datetime.ts';

// Composer builders — `array` / `tuple` / `union` / `intersection` / `record` /
// `map` / `set` / `promise` / `func` / `callable` / `templateLiteral`, the `object` assembler,
// the `propMod({optional?, readonly?}, field)` / `optional(field)` property-modifier
// wrappers, and the recursive-schema pair `circular((self) => …)` / `self()`. Each
// returns the generic `RunType<…>`; child schemas nest freely (the outer composer's
// marker reflects the whole shape).
export {
  object,
  array,
  tuple,
  union,
  intersection,
  record,
  map,
  set,
  promise,
  circular,
  self,
  func,
  callable,
  templateLiteral,
  propMod,
  optional,
} from './compose.ts';

// Utility-type builders — Partial / Required / Pick / Omit / Exclude / Extract /
// NonNullable / Readonly / ReturnType + Parameters. Each brands the RESOLVED
// stdlib utility type; tsgo resolves it before the Go scanner computes the id, so
// `createValidate(partial(model))` converges with `createValidate<Partial<T>>()`.
// `readonlyType` is re-aliased as `readonly` for a natural `RT.readonly(model)`.
export {
  partial,
  required,
  pick,
  omit,
  exclude,
  extract,
  nonNullable,
  readonlyType,
  readonlyType as readonly,
  returnType,
  parameters,
} from './utility.ts';

// Predefined STRING-format builders — one per named string format alias
// (`email` / `uuidv4` / `ipv4` / `domain` / `url` / `alpha` / `numeric` /
// `lowercase` / `stringDate` / `stringTime` / `stringDateTime` / …). Each carries
// the concrete `Format*` alias, so it converges with the type-first surface.
export {
  alpha,
  alphaNumeric,
  numeric,
  lowercase,
  uppercase,
  capitalize,
  uuidv4,
  uuidv7,
  ip,
  ipv4,
  ipv6,
  ipWithPort,
  ipv4WithPort,
  ipv6WithPort,
  domain,
  domainUnicode,
  domainPunycode,
  domainStrict,
  email,
  emailPunycode,
  emailStrict,
  url,
  urlHttp,
  urlFile,
  stringDate,
  stringTime,
  stringDateTime,
} from './stringFormats.ts';

// Predefined NUMBER-format builders — `integer` / `float` / `positive` /
// `negative` / `positiveInt` / `negativeInt` / `int8` / `int16` / `int32` /
// `uint8` / `uint16` / `uint32`.
export {
  integer,
  float,
  positive,
  negative,
  positiveInt,
  negativeInt,
  int8,
  int16,
  int32,
  uint8,
  uint16,
  uint32,
} from './numberFormats.ts';

// Predefined BIGINT-format builders — `bigPositive` / `bigNegative` /
// `bigPositiveInt` / `bigNegativeInt` / `bigInt64` / `bigUInt64`.
export {bigPositive, bigNegative, bigPositiveInt, bigNegativeInt, bigInt64, bigUInt64} from './bigintFormats.ts';

// Type-level helpers the builders carry (all in static.ts).
export type {PropModifiers, MapTuple, TemplatePart, AssembleTemplate, BrandArg} from './static.ts';

// Run-type registration is per-entry now: the value-first builders' marker
// call sites import their type's virtual entry module and register it (plus
// transitive children) on first use — no monolithic cache module to populate.
// The built-in pure fns still need to load for materialised validators that
// call them (newRunTypeErr et al.) — their registration file is the side
// effect (each registerPureFnFactory call site registers its entry tuple).
import '../runtypes/pure-fns-utils.ts';
