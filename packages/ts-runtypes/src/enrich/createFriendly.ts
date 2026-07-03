// `createFriendly<T>(map)` — renders `getValidationErrors` output into
// human-readable messages using a `FriendlyType<T>` map (see docs/AI_ENRICHMENT.md).
//
// Pure data over (map, errors): for each error it walks `error.path` into the map,
// picks a template by the `(format.name, formatPath-tail)` discriminator (`type`
// for the base type-shape failure), and interpolates `$[…]` placeholders. NO
// type-id injection and NO rtUtils — error rendering needs only the map. (UI field
// enumeration, which needs the runtype, is the deferred registry-accessor path.)
//
// Aggregation matches the validator: `getValidationErrors` accumulates, so a field
// can carry several errors. Data-form `$errors` yield ONE message per failed
// constraint (a list); a function-form `$errors` yields ONE message per field,
// handed all of that field's failures aggregated.
//
// `createFriendlyI18n<T>(source, options)` — the locale-selecting wrapper over
// the SAME walk (docs/todos → docs/done friendly-type-i18n). The source map IS
// the source language and the terminal fallback; a translation is another
// same-tree `FriendlyType<T>` const. Per leaf, an untranslated / @todo-blank
// template falls through to the source; a plural leaf falls through as a WHOLE
// unit (its own `other` backstops missing arms first). Plural arms are selected
// via `Intl.PluralRules` on the violated bound; `$[val:number:currency]`-style
// tokens route through named `Intl` formats. Always lenient — a partial
// translation renders, it never throws.

import type {RTValidationError, RTValidationErrorPathSegment, TypeFormatError} from '../createRTFunctions.ts';
import type {ErrorTemplates, FailedConstraints, FriendlyType, PluralTemplate} from './friendlyType.ts';

/** A rendered, human-readable validation message for one failure. */
export interface FriendlyMessage {
  /** Dotted path to the field (`profile.email`); `''` for the root. */
  path: string;
  /** The field's friendly label, or its raw last path segment as fallback. */
  label: string;
  /** The interpolated message. */
  message: string;
}

/** What `createFriendly` returns. */
export interface FriendlyRenderer {
  /** The friendly label for a path (dotted string or a raw segment array). */
  label(path: string | RTValidationErrorPathSegment[]): string;
  /** Render a `getValidationErrors` result into friendly messages. */
  errors(errs: RTValidationError[]): FriendlyMessage[];
}

// Runtime view of a node — the authored map is a plain object with `$label` /
// `$errors` meta keys plus child-field keys (`$items` for arrays and rest-tuple
// elements, `$slots` for fixed-tuple positions, `$keys` / `$values` for
// maps/sets).
type FriendlyNodeRuntime = {
  $label?: string;
  $errors?: ErrorTemplates;
  $items?: FriendlyNodeRuntime;
  $slots?: FriendlyNodeRuntime[];
  $keys?: FriendlyNodeRuntime;
  $values?: FriendlyNodeRuntime;
  [field: string]: unknown;
};

// `$[name]` or `$[binding:kind:formatName]` — the closed token set. The
// required bracket-close means a literal colon in prose (`ratio 3:1` outside
// any `$[…]`) is never touched.
const PLACEHOLDER = /\$\[(\w+)(?::(\w+):(\w+))?\]/g;

// The default locale when none is configured: matches the tsconfig
// `i18n.sourceLocale` default, so an unconfigured runtime and an unconfigured
// build agree. Deterministic (never the host locale).
const DEFAULT_LOCALE = 'en';

/** Named `Intl` formats for ONE locale — declared once (the shared formats
 *  module referenced by tsconfig `i18n.formats`) and referenced from templates
 *  as `$[val:number:currency]` → `formats.number.currency`. A `relativeTime`
 *  entry carries the unit alongside the `Intl` options (the token has no unit
 *  slot). */
export interface NamedFormats {
  number?: Record<string, Intl.NumberFormatOptions>;
  date?: Record<string, Intl.DateTimeFormatOptions>;
  relativeTime?: Record<string, Intl.RelativeTimeFormatOptions & {unit: Intl.RelativeTimeFormatUnit}>;
  list?: Record<string, Intl.ListFormatOptions>;
}

// Memoized Intl instances (the i18next addCached model): building
// NumberFormat/PluralRules/… is expensive, so each is built once and reused
// across renders. Module-scope singletons BESIDE the pure walk — the walk
// itself caches nothing. Plural rules key on the locale alone; formatters key
// on `${locale}\0${kind}\0${name}` WITHIN their NamedFormats table (a WeakMap
// per table, so two renderers with different format tables never cross-read a
// same-named format).
const pluralRulesCache = new Map<string, Intl.PluralRules>();
const formatterCaches = new WeakMap<NamedFormats, Map<string, (value: unknown) => string>>();

function cachedPluralRules(locale: string): Intl.PluralRules {
  let rules = pluralRulesCache.get(locale);
  if (!rules) {
    rules = new Intl.PluralRules(locale, {type: 'cardinal'});
    pluralRulesCache.set(locale, rules);
  }
  return rules;
}

/** Build (and cache) the `value => string` closure for one named format, or
 *  undefined when the name is not declared for this locale's table (the token
 *  then stays verbatim). */
function cachedFormatter(
  locale: string,
  kind: string,
  name: string,
  formats: NamedFormats | undefined
): ((value: unknown) => string) | undefined {
  if (!formats) return undefined;
  let table = formatterCaches.get(formats);
  if (!table) {
    table = new Map();
    formatterCaches.set(formats, table);
  }
  const key = locale + '\0' + kind + '\0' + name;
  const hit = table.get(key);
  if (hit) return hit;
  const formatter = buildFormatter(locale, kind, name, formats);
  if (formatter) table.set(key, formatter);
  return formatter;
}

function buildFormatter(
  locale: string,
  kind: string,
  name: string,
  formats: NamedFormats | undefined
): ((value: unknown) => string) | undefined {
  if (kind === 'number') {
    const options = formats?.number?.[name];
    if (!options) return undefined;
    const numberFormat = new Intl.NumberFormat(locale, options);
    return (value) => numberFormat.format(Number(value));
  }
  if (kind === 'date') {
    const options = formats?.date?.[name];
    if (!options) return undefined;
    const dateFormat = new Intl.DateTimeFormat(locale, options);
    return (value) => dateFormat.format(value instanceof Date ? value : new Date(value as string | number));
  }
  if (kind === 'relativeTime') {
    const options = formats?.relativeTime?.[name];
    if (!options || !options.unit) return undefined;
    const relativeFormat = new Intl.RelativeTimeFormat(locale, options);
    return (value) => relativeFormat.format(Number(value), options.unit);
  }
  if (kind === 'list') {
    const options = formats?.list?.[name];
    if (!options) return undefined;
    const listFormat = new Intl.ListFormat(locale, options);
    return (value) => listFormat.format(Array.isArray(value) ? value.map(String) : [String(value)]);
  }
  return undefined; // unknown kind — token stays verbatim
}

/** Select a plural template's arm for the violated bound: the file-locale's
 *  CLDR category via `Intl.PluralRules`, `other` as the in-leaf backstop. A
 *  non-finite bound selects `other` directly (`select(NaN)` throws
 *  RangeError). A blank (`''` @todo) arm falls to `other` too, so a
 *  half-filled plural degrades inside its own leaf before the caller falls
 *  back across maps. */
function selectPlural(leaf: PluralTemplate, bound: string | number | boolean | bigint | undefined, locale: string): string {
  const count = Number(bound);
  if (!Number.isFinite(count)) return leaf.other;
  const category = cachedPluralRules(locale).select(count);
  return leaf[category] || leaf.other;
}

/** A path segment's dotted-path key: a string field name, an array / tuple
 *  index, or a Map / Set entry's iteration index (its numeric `key`). */
function segmentKey(seg: RTValidationErrorPathSegment): string | number {
  if (typeof seg === 'string' || typeof seg === 'number') return seg;
  return seg.key;
}

/** Descend one segment: string → child field; number → `$slots[i]` for a fixed
 *  tuple, else `$items` (array / rest-tuple element); Map / Set entry → `$keys`
 *  (a `mapKey` failure) or `$values` (a `mapValue` / `setKey` failure), routed
 *  by the segment's `failed` role. A fixed tuple has positional `$slots`; an
 *  array (and a rest tuple, whose `length` is the broad `number`) has `$items`. */
function descend(node: FriendlyNodeRuntime | undefined, seg: RTValidationErrorPathSegment): FriendlyNodeRuntime | undefined {
  if (!node) return undefined;
  if (typeof seg === 'string') return node[seg] as FriendlyNodeRuntime | undefined;
  if (typeof seg === 'number') return node.$slots ? node.$slots[seg] : node.$items;
  return seg.failed === 'mapKey' ? node.$keys : node.$values;
}

function nodeAt(root: FriendlyNodeRuntime, path: RTValidationErrorPathSegment[]): FriendlyNodeRuntime | undefined {
  let node: FriendlyNodeRuntime | undefined = root;
  for (const seg of path) node = descend(node, seg);
  return node;
}

/** Fallback label when a node has no `$label`: the last STRING segment (the
 *  field name) if any, else the last segment stringified. */
function rawLabel(path: RTValidationErrorPathSegment[]): string {
  for (let i = path.length - 1; i >= 0; i--) {
    if (typeof path[i] === 'string') return path[i] as string;
  }
  const tail = path.length ? segmentKey(path[path.length - 1]) : undefined;
  return tail === undefined ? '' : String(tail);
}

function pathToString(path: RTValidationErrorPathSegment[]): string {
  return path.map((seg) => String(segmentKey(seg))).join('.');
}

/** The template key for an error: the format sub-constraint (`formatPath` tail),
 *  else the format name, else `type` for a base type-shape failure. */
function constraintKey(format: TypeFormatError | undefined): string {
  if (!format) return 'type';
  const tail = format.formatPath[format.formatPath.length - 1];
  return tail !== undefined ? String(tail) : format.name;
}

/** Keep only primitive constraint values; arrays/objects → undefined. */
function primitiveVal(val: TypeFormatError['val'] | undefined): string | number | boolean | bigint | undefined {
  const kind = typeof val;
  if (kind === 'string' || kind === 'number' || kind === 'boolean' || kind === 'bigint') {
    return val as string | number | boolean | bigint;
  }
  return undefined;
}

/** The last numeric path segment (array index or Map / Set entry index), for
 *  `$[index]`. */
function numericIndex(path: RTValidationErrorPathSegment[]): number | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    const key = segmentKey(path[i]);
    if (typeof key === 'number') return key;
  }
  return undefined;
}

interface InterpolateCtx {
  label: string;
  val?: string | number | boolean | bigint;
  path: string;
  index?: number;
  /** The UNPROJECTED constraint value (arrays survive) — only `Intl` format
   *  tokens read it (e.g. `$[val:list:or]` over an allow-list bound). */
  rawVal?: unknown;
  /** Active render locale + its named formats; absent for the single-locale
   *  `createFriendly` path (three-part tokens then stay verbatim). */
  locale?: string;
  formats?: NamedFormats;
}

function interpolate(template: string, ctx: InterpolateCtx): string {
  return template.replace(PLACEHOLDER, (whole: string, name: string, kind?: string, formatName?: string) => {
    // Three-part `$[binding:kind:name]` — route through a named Intl format.
    // Unknown binding/kind/name (or no formats configured) leaves the token
    // verbatim, matching the unknown-token rule below.
    if (kind && formatName) {
      if (name !== 'val' && name !== 'index') return whole;
      const formatter = cachedFormatter(ctx.locale ?? DEFAULT_LOCALE, kind, formatName, ctx.formats);
      if (!formatter) return whole;
      const value = name === 'index' ? ctx.index : (ctx.rawVal ?? ctx.val);
      return value === undefined ? '' : formatter(value);
    }
    if (name === 'label') return ctx.label;
    if (name === 'val') return ctx.val === undefined ? '' : String(ctx.val);
    if (name === 'path') return ctx.path;
    if (name === 'index') return ctx.index === undefined ? '' : String(ctx.index);
    return whole;
  });
}

interface PathGroup {
  path: RTValidationErrorPathSegment[];
  pathStr: string;
  errors: RTValidationError[];
}

/** Grouping signature: the dotted path, but a Map / Set entry also encodes its
 *  `failed` role so a key-failure and a value-failure at the SAME entry index
 *  resolve to their own (`$keys` vs `$values`) node instead of colliding. */
function groupSignature(path: RTValidationErrorPathSegment[]): string {
  return path.map((seg) => (typeof seg === 'object' ? `${seg.key} ${seg.failed ?? ''}` : String(seg))).join('.');
}

/** Group errors by path (role-aware for Map / Set), preserving first-seen order. */
function groupByPath(errs: RTValidationError[]): PathGroup[] {
  const groups: PathGroup[] = [];
  const bySignature = new Map<string, PathGroup>();
  for (const err of errs) {
    const signature = groupSignature(err.path);
    let group = bySignature.get(signature);
    if (!group) {
      group = {path: err.path, pathStr: pathToString(err.path), errors: []};
      bySignature.set(signature, group);
      groups.push(group);
    }
    group.errors.push(err);
  }
  return groups;
}

// One render pass's resolved inputs: the map to read (a translation, or the
// source itself), the locale whose CLDR rules select plural arms in that map,
// the terminal-fallback source map (absent on the single-locale path), the
// source's own plural-rules locale, and the active locale's named formats.
// Built fresh per label()/errors() call by the i18n wrapper (the reactive
// `{value}` locale seam), once by `createFriendly`.
interface RenderState {
  root: FriendlyNodeRuntime;
  rootLocale: string;
  source?: FriendlyNodeRuntime;
  sourceLocale: string;
  formats?: NamedFormats;
}

const labelFor = (node: FriendlyNodeRuntime | undefined, path: RTValidationErrorPathSegment[]): string =>
  node?.$label || rawLabel(path);

// resolveTemplate picks one map-node's template string for a constraint key:
// `$errors[key]`, then the same node's authored `$errors.$default` catch-all
// (the author's own-language fallback beats the other map's specific message);
// a plural leaf selects its arm with the MAP's locale (never the other map's —
// plural leaves are atomic per map). Returns undefined when the node yields
// nothing renderable (missing node / missing key / blank `''` @todo
// templates), which is the caller's cross-map fallback signal. Function-form
// `$errors` never lands here (handled at the group level).
function resolveTemplate(
  node: FriendlyNodeRuntime | undefined,
  key: string,
  val: string | number | boolean | bigint | undefined,
  mapLocale: string
): string | undefined {
  const errorTemplates = node?.$errors;
  if (!errorTemplates || typeof errorTemplates === 'function') return undefined;
  return leafTemplate(errorTemplates[key], val, mapLocale) ?? leafTemplate(errorTemplates.$default, val, mapLocale);
}

// leafTemplate renders one template leaf to a non-blank string, or undefined —
// a blank `''` (an unfilled @todo) counts as absent so fallback can proceed.
function leafTemplate(
  leaf: string | PluralTemplate | undefined,
  val: string | number | boolean | bigint | undefined,
  mapLocale: string
): string | undefined {
  if (leaf === undefined) return undefined;
  const template = typeof leaf === 'string' ? leaf : selectPlural(leaf, val, mapLocale);
  return template || undefined;
}

function renderLabel(state: RenderState, path: string | RTValidationErrorPathSegment[]): string {
  const segs = typeof path === 'string' ? (path === '' ? [] : path.split('.')) : path;
  const node = nodeAt(state.root, segs);
  if (node?.$label) return node.$label;
  const sourceNode = state.source ? nodeAt(state.source, segs) : undefined;
  return labelFor(sourceNode, segs);
}

function renderErrors(state: RenderState, errs: RTValidationError[]): FriendlyMessage[] {
  const out: FriendlyMessage[] = [];
  for (const group of groupByPath(errs)) {
    const node = nodeAt(state.root, group.path);
    const sourceNode = state.source ? nodeAt(state.source, group.path) : undefined;
    const label = node?.$label || sourceNode?.$label || rawLabel(group.path);

    // Function-form $errors is the opaque escape hatch: the map that declares
    // one owns the whole field's rendering (the i18n layer never reaches into
    // the arrow — the author owns their own t() inside it). The translation's
    // form wins when present; a translation without $errors falls to a source
    // arrow.
    const ownedTemplates = node?.$errors ?? sourceNode?.$errors;
    if (typeof ownedTemplates === 'function') {
      const failed: FailedConstraints = {};
      for (const err of group.errors) failed[constraintKey(err.format)] = {val: primitiveVal(err.format?.val)};
      out.push({path: group.pathStr, label, message: ownedTemplates(failed)});
      continue;
    }

    const index = numericIndex(group.path);
    for (const err of group.errors) {
      const key = constraintKey(err.format);
      const val = primitiveVal(err.format?.val);
      // Leaf-granular fallback: the translation's leaf, else the source's.
      // Each map selects plural arms with ITS OWN locale's rules, so a
      // translated plural is atomic (never a target `few` mixed with a source
      // `other` mid-message).
      const template =
        resolveTemplate(node, key, val, state.rootLocale) ?? resolveTemplate(sourceNode, key, val, state.sourceLocale);
      const message = template
        ? interpolate(template, {
            label,
            val,
            path: group.pathStr,
            index,
            rawVal: err.format?.val,
            locale: state.rootLocale,
            formats: state.formats,
          })
        : `${label || 'value'} is invalid`;
      out.push({path: group.pathStr, label, message});
    }
  }
  return out;
}

export function createFriendly<T>(map: FriendlyType<T>): FriendlyRenderer {
  const state: RenderState = {
    root: map as FriendlyNodeRuntime,
    rootLocale: DEFAULT_LOCALE,
    sourceLocale: DEFAULT_LOCALE,
  };
  return {
    label: (path) => renderLabel(state, path),
    errors: (errs) => renderErrors(state, errs),
  };
}

/** Options for `createFriendlyI18n`. */
export interface FriendlyI18nOptions<T> {
  /** The active locale: a plain tag, or any `{value}` ref (e.g. a Vue Ref) —
   *  read structurally on EVERY render, so switching the ref re-renders with
   *  zero API churn. (The renderer itself is not reactivity-tracked: call it
   *  inside a `computed()` / re-invoke `errors()` per render.) */
  locale: string | {readonly value: string};
  /** Committed translation consts by locale tag (`{es: es_friendlyUser}`).
   *  Values are the same-tree `Translation<T>` maps. */
  translations: Partial<Record<string, FriendlyType<T>>>;
  /** Named `Intl` formats per locale tag (the shared formats module). The
   *  ACTIVE locale's entry is used; a locale without one renders three-part
   *  tokens verbatim. */
  formats?: Record<string, NamedFormats>;
  /** The language the SOURCE map is authored in (default 'en') — the
   *  `Intl.PluralRules` used when a plural leaf renders from the source. */
  sourceLocale?: string;
  /** Reserved: the runtime is ALWAYS lenient (per-leaf fallback to source);
   *  strictness lives in `ts-runtypes check --translate`. */
  strict?: boolean;
}

/** Pick the best translation tag for a requested locale via BCP-47 truncation:
 *  exact tag first, then subtags dropped right-to-left (`pt-BR` → `pt`), then
 *  any available tag whose own truncation shares the base language (`zh-Hant`
 *  matches a `zh-Hans` file when nothing closer exists — naive by design).
 *  Returns undefined when nothing shares the base language (the caller falls
 *  back to the source). */
export function resolveLocale<T>(locale: string, translations: Partial<Record<string, FriendlyType<T>>>): string | undefined {
  if (!locale) return undefined;
  const have = (tag: string) => translations[tag] !== undefined;
  // Exact, then right-to-left truncation of the requested tag.
  const parts = locale.split('-');
  for (let keep = parts.length; keep >= 1; keep--) {
    const candidate = parts.slice(0, keep).join('-');
    if (have(candidate)) return candidate;
  }
  // Base-language match against the AVAILABLE tags (zh-Hant → zh-Hans).
  const baseLanguage = parts[0].toLowerCase();
  for (const tag of Object.keys(translations)) {
    if (translations[tag] !== undefined && tag.split('-')[0].toLowerCase() === baseLanguage) return tag;
  }
  return undefined;
}

/** The locale-selecting wrapper over the one pure `createFriendly` walk. The
 *  `source` map is the source language and the terminal fallback; every leaf
 *  (labels, error templates) falls through to it when the active translation
 *  leaves it blank. Never throws on a partial translation. */
export function createFriendlyI18n<T>(source: FriendlyType<T>, options: FriendlyI18nOptions<T>): FriendlyRenderer {
  const sourceRoot = source as FriendlyNodeRuntime;
  const sourceLocale = options.sourceLocale ?? DEFAULT_LOCALE;

  // Resolved fresh on EVERY render — the reactive `{value}` locale seam.
  const state = (): RenderState => {
    const active = typeof options.locale === 'object' ? options.locale.value : options.locale;
    const matched = resolveLocale<T>(active, options.translations);
    const translation = matched !== undefined ? (options.translations[matched] as FriendlyNodeRuntime) : undefined;
    return {
      root: translation ?? sourceRoot,
      rootLocale: translation ? (matched as string) : sourceLocale,
      source: translation ? sourceRoot : undefined,
      sourceLocale,
      formats: options.formats?.[matched ?? active] ?? options.formats?.[active],
    };
  };

  return {
    label: (path) => renderLabel(state(), path),
    errors: (errs) => renderErrors(state(), errs),
  };
}
