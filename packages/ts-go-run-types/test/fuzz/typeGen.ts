// Phase 2 — the THIRD giant switch: a seeded, recursive generator of random
// (but always valid + serialisable) TypeScript type SHAPES, plus a renderer to
// `.ts` source. Where Phase 1 fuzzes VALUES against a fixed set of types, this
// fuzzes the TYPES themselves: each generated shape becomes a real type
// declaration with `createX<T>()` call sites that the Go resolver → plugin →
// runtime pipeline must handle (typeFuzzHarness.ts), checked against the same
// oracles (typeFuzzRunner.ts).
//
// Everything draws from the global `Math.random`, so wrapping a generation in
// `withSeededRandom(seed, …)` (seededRng.ts) makes the whole shape — and the
// matching value stream in shapeValue.ts — replay byte-for-byte from one seed.
//
// Generated shapes are deliberately restricted to the DATA-ONLY, serialisable
// surface (no functions / methods / symbols / index signatures): the validate
// and JSON/binary contracts silently drop non-serialisable members, which would
// turn a strong oracle (O1/O5/O6) into a false positive. The space that remains
// — primitives, literals, Date, bigint, arrays, tuples, optional object props,
// nested objects, and three well-formed union flavours — is exactly the space
// the strong oracles can police without caveats.

/** An abstract, renderable type shape. The discriminant `kind` mirrors the
 *  RunType kinds the emitters care about, restricted to the serialisable set. **/
export type TypeShape =
  | {kind: 'number'}
  | {kind: 'string'}
  | {kind: 'boolean'}
  | {kind: 'bigint'}
  | {kind: 'null'}
  | {kind: 'date'}
  | {kind: 'literal'; value: string | number | boolean}
  | {kind: 'array'; elem: TypeShape}
  | {kind: 'tuple'; elems: TypeShape[]}
  | {kind: 'object'; props: PropShape[]}
  | {kind: 'union'; members: TypeShape[]};

export interface PropShape {
  /** Raw property key (may be a non-identifier — renderer quotes it). **/
  name: string;
  optional: boolean;
  shape: TypeShape;
}

export interface GenOptions {
  /** Max nesting depth (objects/arrays/tuples/unions stop branching at it). **/
  maxDepth: number;
  /** Max object properties / tuple slots / union members per compound. **/
  maxBreadth: number;
  /** Include `Date` leaves. **/
  date: boolean;
  /** Include `bigint` leaves. **/
  bigint: boolean;
  /** Include union shapes (literal, primitive, and tagged-object flavours). **/
  unions: boolean;
  /** Occasionally emit non-identifier property keys (exercise bracket-access
   *  codegen / isSafeName). **/
  weirdKeys: boolean;
}

export const DEFAULT_GEN_OPTIONS: GenOptions = {
  maxDepth: 4,
  maxBreadth: 4,
  date: true,
  bigint: true,
  unions: true,
  weirdKeys: true,
};

// --- small seeded helpers (all over the swapped-in Math.random) ---

function rnd(): number {
  return Math.random();
}
function int(maxExclusive: number): number {
  return Math.floor(rnd() * maxExclusive);
}
function pick<T>(items: readonly T[]): T {
  return items[int(items.length)];
}
function chance(p: number): boolean {
  return rnd() < p;
}

const WEIRD_KEYS = ['a-b', '1x', 'has space', 'class', '__proto__like', 'k.dot', '9'];

/** A leaf (non-compound) shape, gated by the enabled-kinds options. **/
function genLeaf(opts: GenOptions): TypeShape {
  const leaves: Array<() => TypeShape> = [
    () => ({kind: 'number'}),
    () => ({kind: 'string'}),
    () => ({kind: 'boolean'}),
    () => ({kind: 'null'}),
    () => genLiteral(),
  ];
  if (opts.date) leaves.push(() => ({kind: 'date'}));
  if (opts.bigint) leaves.push(() => ({kind: 'bigint'}));
  return pick(leaves)();
}

function genLiteral(): TypeShape {
  const flavour = int(3);
  if (flavour === 0) return {kind: 'literal', value: pick(['on', 'off', 'red', 'green', 'A', 'B'])};
  if (flavour === 1) return {kind: 'literal', value: pick([0, 1, 7, 42, -3])};
  return {kind: 'literal', value: chance(0.5)};
}

/** Generate a random shape, branching into compounds until `maxDepth`. **/
export function genShape(opts: GenOptions = DEFAULT_GEN_OPTIONS, depth = 0): TypeShape {
  if (depth >= opts.maxDepth || chance(0.45)) return genLeaf(opts);
  const compounds: Array<() => TypeShape> = [
    () => ({kind: 'array', elem: genShape(opts, depth + 1)}),
    () => genTuple(opts, depth),
    () => genObject(opts, depth),
  ];
  if (opts.unions) compounds.push(() => genUnion(opts, depth));
  return pick(compounds)();
}

function genTuple(opts: GenOptions, depth: number): TypeShape {
  const length = 1 + int(opts.maxBreadth);
  const elems: TypeShape[] = [];
  for (let i = 0; i < length; i++) elems.push(genShape(opts, depth + 1));
  return {kind: 'tuple', elems};
}

function genObject(opts: GenOptions, depth: number): TypeShape {
  const count = 1 + int(opts.maxBreadth);
  const props: PropShape[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let name = `p${i}`;
    if (opts.weirdKeys && chance(0.15)) {
      const weird = pick(WEIRD_KEYS);
      if (!used.has(weird)) name = weird;
    }
    if (used.has(name)) continue;
    used.add(name);
    props.push({name, optional: chance(0.35), shape: genShape(opts, depth + 1)});
  }
  return {kind: 'object', props};
}

// Unions are kept value-level DISJOINT so the strong oracles stay sound: a
// literal union of distinct values, a small set of distinct primitive kinds, or
// a tagged union of objects with a distinct discriminant literal. Overlapping
// members (e.g. `number | 5`) are never generated.
function genUnion(opts: GenOptions, depth: number): TypeShape {
  const flavour = pick(['literals', 'primitives', 'tagged'] as const);
  const count = 2 + int(Math.max(1, opts.maxBreadth - 1));
  if (flavour === 'literals') return {kind: 'union', members: genDistinctLiterals(count)};
  if (flavour === 'primitives') return {kind: 'union', members: genDistinctPrimitives(count, opts)};
  return {kind: 'union', members: genTaggedObjects(count, opts, depth)};
}

function genDistinctLiterals(count: number): TypeShape[] {
  // Distinct STRING literals keep the union unambiguous and serialisable.
  const pool = ['la', 'lb', 'lc', 'ld', 'le', 'lf'];
  const members: TypeShape[] = [];
  for (let i = 0; i < Math.min(count, pool.length); i++) members.push({kind: 'literal', value: pool[i]});
  return members.length >= 2
    ? members
    : [
        {kind: 'literal', value: 'la'},
        {kind: 'literal', value: 'lb'},
      ];
}

function genDistinctPrimitives(count: number, opts: GenOptions): TypeShape[] {
  const kinds: TypeShape[] = [{kind: 'string'}, {kind: 'number'}, {kind: 'boolean'}];
  if (opts.bigint) kinds.push({kind: 'bigint'});
  // Take a distinct subset (no kind repeats — keeps members disjoint).
  const shuffled = [...kinds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.max(2, Math.min(count, shuffled.length)));
}

function genTaggedObjects(count: number, opts: GenOptions, depth: number): TypeShape[] {
  const members: TypeShape[] = [];
  const n = Math.min(count, 4);
  for (let i = 0; i < n; i++) {
    const props: PropShape[] = [{name: 'kind', optional: false, shape: {kind: 'literal', value: `t${i}`}}];
    const extra = int(opts.maxBreadth);
    for (let k = 0; k < extra; k++) props.push({name: `f${k}`, optional: chance(0.3), shape: genShape(opts, depth + 2)});
    members.push({kind: 'object', props});
  }
  return members;
}

// =============================================================================
// Rendering — TypeShape → TS type-expression source.
// =============================================================================

function isIdent(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}

function renderKey(name: string): string {
  return isIdent(name) ? name : JSON.stringify(name);
}

/** Render a shape to a TS type expression (always parenthesised where needed so
 *  it composes safely as an array element / union member). **/
export function renderType(shape: TypeShape): string {
  switch (shape.kind) {
    case 'number':
      return 'number';
    case 'string':
      return 'string';
    case 'boolean':
      return 'boolean';
    case 'bigint':
      return 'bigint';
    case 'null':
      return 'null';
    case 'date':
      return 'Date';
    case 'literal':
      return typeof shape.value === 'string' ? JSON.stringify(shape.value) : String(shape.value);
    case 'array':
      return `Array<${renderType(shape.elem)}>`;
    case 'tuple':
      return `[${shape.elems.map(renderType).join(', ')}]`;
    case 'object':
      if (shape.props.length === 0) return '{}';
      return `{${shape.props.map((p) => `${renderKey(p.name)}${p.optional ? '?' : ''}: ${renderType(p.shape)}`).join('; ')}}`;
    case 'union':
      return `(${shape.members.map(renderType).join(' | ')})`;
  }
}

/** A short, human-readable summary of a shape for test titles / logs. **/
export function describeShape(shape: TypeShape, depth = 0): string {
  if (depth > 2) return '…';
  switch (shape.kind) {
    case 'array':
      return `${describeShape(shape.elem, depth + 1)}[]`;
    case 'tuple':
      return `[${shape.elems.map((s) => describeShape(s, depth + 1)).join(',')}]`;
    case 'object':
      return `{${shape.props.length}}`;
    case 'union':
      return `(${shape.members.map((s) => describeShape(s, depth + 1)).join('|')})`;
    case 'literal':
      return typeof shape.value === 'string' ? `'${shape.value}'` : String(shape.value);
    default:
      return shape.kind;
  }
}

/** Count every node in a shape — used by tests to bound generation size. **/
export function countNodes(shape: TypeShape): number {
  switch (shape.kind) {
    case 'array':
      return 1 + countNodes(shape.elem);
    case 'tuple':
      return 1 + shape.elems.reduce((sum, s) => sum + countNodes(s), 0);
    case 'object':
      return 1 + shape.props.reduce((sum, p) => sum + countNodes(p.shape), 0);
    case 'union':
      return 1 + shape.members.reduce((sum, s) => sum + countNodes(s), 0);
    default:
      return 1;
  }
}
