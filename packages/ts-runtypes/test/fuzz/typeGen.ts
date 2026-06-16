// Phase 2 — the THIRD giant switch: a seeded, recursive generator of random
// TypeScript types, deliberately spanning the WIDEST shape space we can throw at
// the pipeline. Where Phase 1 fuzzes VALUES against fixed types, this fuzzes the
// TYPES themselves: each generated type becomes a real declaration with one
// createX<T>() / getRunTypeId<T>() call site per family, and the whole Go
// resolver → plugin → runtime pipeline must handle it without crashing.
//
// The space is intentionally adversarial — not just clean DTOs:
//   - scalars + literals + `Date` / `RegExp` / `bigint`,
//   - arrays, tuples, objects (optional / readonly / method / non-ident keys),
//   - index signatures + `Record<…>`, unions, intersections,
//   - native builtins `Map` / `Set` / `Promise`,
//   - non-serialisable kinds: `function`, `symbol`, `any` / `unknown` /
//     `never` / `void` / `undefined`,
//   - named declarations: `interface` (incl. RECURSIVE / circular), `declare
//     class` (with methods), `enum`.
//
// Whether a generated type is fully serialisable is NOT a generation-time
// concern — the resolver's own diagnostics classify it at run time
// (typeFuzzRunner.ts), and the oracle tier is chosen from that. So the generator
// is free to emit anything that type-checks; robustness (no crash, valid emit)
// is policed on everything, the strong value oracles only on the serialisable
// subset.
//
// Everything draws from the global `Math.random`, so wrapping a generation in
// `withSeededRandom(seed, …)` (seededRng.ts) replays the whole type — decls and
// all — byte-for-byte from one seed.

// --- abstract shape model ---

export type TypeShape =
  | {kind: 'number'}
  | {kind: 'string'}
  | {kind: 'boolean'}
  | {kind: 'bigint'}
  | {kind: 'null'}
  | {kind: 'undefined'}
  | {kind: 'date'}
  | {kind: 'regexp'}
  | {kind: 'literal'; value: string | number | boolean}
  | {kind: 'any'}
  | {kind: 'unknown'}
  | {kind: 'never'}
  | {kind: 'void'}
  | {kind: 'symbol'}
  | {kind: 'array'; elem: TypeShape}
  | {kind: 'tuple'; elems: TypeShape[]}
  | {kind: 'object'; props: PropShape[]; index?: TypeShape}
  | {kind: 'record'; value: TypeShape}
  | {kind: 'union'; members: TypeShape[]}
  | {kind: 'intersection'; members: TypeShape[]}
  | {kind: 'map'; key: TypeShape; value: TypeShape}
  | {kind: 'set'; elem: TypeShape}
  | {kind: 'promise'; value: TypeShape}
  | {kind: 'function'; params: TypeShape[]; ret: TypeShape}
  | {kind: 'ref'; name: string};

export interface PropShape {
  /** Raw property key (may be a non-identifier — renderer quotes it). **/
  name: string;
  optional: boolean;
  readonly: boolean;
  /** Render as a method signature (`m(): R`) rather than `m: (…) => R`. **/
  method: boolean;
  shape: TypeShape;
}

export type Decl =
  | {kind: 'interface'; name: string; props: PropShape[]}
  | {kind: 'type'; name: string; shape: TypeShape}
  | {kind: 'class'; name: string; props: PropShape[]}
  | {kind: 'enum'; name: string; members: EnumMember[]};

export interface EnumMember {
  name: string;
  value?: string | number;
}

/** A complete generated type: zero or more named declarations + the root type
 *  expression that the createX<T>() sites target. **/
export interface GeneratedType {
  decls: Decl[];
  root: TypeShape;
}

export interface GenOptions {
  maxDepth: number;
  maxBreadth: number;
  /** Master switch: when false, restrict to the serialisable subset (drives the
   *  strong-oracle sweep); when true, the full adversarial space. **/
  wild: boolean;
  /** Emit non-identifier property keys sometimes. **/
  weirdKeys: boolean;
  /** Generate named decls (interfaces / classes / enums), including recursive
   *  interfaces. **/
  named: boolean;
}

export const WILD_GEN_OPTIONS: GenOptions = {maxDepth: 4, maxBreadth: 4, wild: true, weirdKeys: true, named: true};

/** Serialisable-only preset — the strong value oracles (O1/O2/O5/O6) need clean
 *  round-trippable types. Still includes recursive interfaces, Map/Set/RegExp,
 *  records, intersections — everything that round-trips. **/
export const DATA_GEN_OPTIONS: GenOptions = {maxDepth: 4, maxBreadth: 4, wild: false, weirdKeys: true, named: true};

// keep DEFAULT pointed at the wild space — the headline behaviour.
export const DEFAULT_GEN_OPTIONS = WILD_GEN_OPTIONS;

// --- seeded helpers (all over the swapped-in Math.random) ---

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

const WEIRD_KEYS = ['a-b', '1x', 'has space', 'class', '__proto__like', 'k.dot', '9', 'with"quote'];

// Generation context — collects named decls and bounds recursion. `refs` holds
// the decls that are in scope as `ref` targets (interfaces/classes/enums).
interface Ctx {
  opts: GenOptions;
  decls: Decl[];
  refs: {name: string; kind: Decl['kind']}[];
  nameSeq: number;
}

function freshName(ctx: Ctx, prefix: string): string {
  return `${prefix}${ctx.nameSeq++}`;
}

/** Generate a whole type: a handful of named decls (some recursive) + a root. **/
export function genType(opts: GenOptions = DEFAULT_GEN_OPTIONS): GeneratedType {
  const ctx: Ctx = {opts, decls: [], refs: [], nameSeq: 0};
  if (opts.named) {
    const declCount = int(3); // 0–2 named decls
    for (let i = 0; i < declCount; i++) genDecl(ctx);
  }
  const root = genShape(ctx, 0);
  return {decls: ctx.decls, root};
}

function genDecl(ctx: Ctx): void {
  const choice = ctx.opts.wild
    ? pick(['interface', 'interface', 'class', 'enum'] as const)
    : pick(['interface', 'interface', 'enum'] as const);
  if (choice === 'enum') {
    const name = freshName(ctx, 'E');
    const count = 1 + int(4);
    const stringValued = chance(0.5);
    const members: EnumMember[] = [];
    // Either all string-valued, or all auto-numbered (member i === i) — keeps
    // the runtime value of each member trivially computable for value-gen.
    for (let i = 0; i < count; i++) {
      members.push(stringValued ? {name: `M${i}`, value: `e${i}`} : {name: `M${i}`});
    }
    ctx.decls.push({kind: 'enum', name, members});
    ctx.refs.push({name, kind: 'enum'});
    return;
  }
  if (choice === 'class') {
    const name = freshName(ctx, 'C');
    // Register before generating members so a member can reference the class.
    ctx.refs.push({name, kind: 'class'});
    const props = genMembers(ctx, 1, name, true);
    ctx.decls.push({kind: 'class', name, props});
    return;
  }
  // interface — register the name first so props can self-reference (recursive).
  const name = freshName(ctx, 'N');
  ctx.refs.push({name, kind: 'interface'});
  const props = genMembers(ctx, 1, name, ctx.opts.wild);
  ctx.decls.push({kind: 'interface', name, props});
}

// Generate object/interface/class members. `selfName`, when set, is in scope as
// a recursive ref target — but ONLY ever placed in inhabitable positions
// (optional props or array elements) so values stay finite.
function genMembers(ctx: Ctx, depth: number, selfName: string | undefined, allowMethods: boolean): PropShape[] {
  const count = 1 + int(ctx.opts.maxBreadth);
  const props: PropShape[] = [];
  const used = new Set<string>();
  for (let i = 0; i < count; i++) {
    let name = `p${i}`;
    if (ctx.opts.weirdKeys && chance(0.12)) {
      const weird = pick(WEIRD_KEYS);
      if (!used.has(weird)) name = weird;
    }
    if (used.has(name)) continue;
    used.add(name);
    const optional = chance(0.35);
    const method = allowMethods && ctx.opts.wild && chance(0.15);
    let shape: TypeShape;
    if (method) {
      shape = {kind: 'function', params: genParams(ctx, depth), ret: genShape(ctx, depth + 1)};
    } else if (selfName && optional && chance(0.5)) {
      // recursive self-reference through an optional prop (always inhabitable)
      shape = chance(0.5) ? {kind: 'ref', name: selfName} : {kind: 'array', elem: {kind: 'ref', name: selfName}};
    } else {
      shape = genShape(ctx, depth + 1);
    }
    props.push({name, optional, readonly: chance(0.2), method, shape});
  }
  // bias toward at least one recursive array prop for declared self-types
  if (selfName && chance(0.4)) {
    props.push({
      name: `kids${props.length}`,
      optional: false,
      readonly: false,
      method: false,
      shape: {kind: 'array', elem: {kind: 'ref', name: selfName}},
    });
  }
  return props;
}

function genParams(ctx: Ctx, depth: number): TypeShape[] {
  const count = int(3);
  const params: TypeShape[] = [];
  for (let i = 0; i < count; i++) params.push(genShape(ctx, depth + 1));
  return params;
}

/** Generate a shape at `depth`, branching into compounds until maxDepth. **/
export function genShape(ctx: Ctx, depth: number): TypeShape {
  if (depth >= ctx.opts.maxDepth || chance(0.4)) return genLeaf(ctx);
  const builders: Array<() => TypeShape> = [
    () => ({kind: 'array', elem: genShape(ctx, depth + 1)}),
    () => genTuple(ctx, depth),
    () => genObject(ctx, depth),
    () => genUnion(ctx, depth),
    () => ({kind: 'record', value: genShape(ctx, depth + 1)}),
  ];
  if (ctx.opts.wild) {
    builders.push(
      () => genIntersection(ctx, depth),
      () => ({kind: 'map', key: pick<TypeShape>([{kind: 'string'}, {kind: 'number'}]), value: genShape(ctx, depth + 1)}),
      () => ({kind: 'set', elem: genShape(ctx, depth + 1)}),
      () => ({kind: 'promise', value: genShape(ctx, depth + 1)}),
      () => ({kind: 'function', params: genParams(ctx, depth), ret: genShape(ctx, depth + 1)})
    );
  } else {
    // serialisable-only Map/Set still round-trip — keep them in the data preset.
    builders.push(
      () => genIntersection(ctx, depth),
      () => ({kind: 'map', key: pick<TypeShape>([{kind: 'string'}, {kind: 'number'}]), value: genShape(ctx, depth + 1)}),
      () => ({kind: 'set', elem: genShape(ctx, depth + 1)})
    );
  }
  // sometimes reference a declared type instead of generating inline
  const usableRefs = ctx.refs.filter((r) => (ctx.opts.wild ? true : r.kind !== 'class'));
  if (usableRefs.length && chance(0.3)) {
    const ref = pick(usableRefs);
    return {kind: 'ref', name: ref.name};
  }
  return pick(builders)();
}

function genLeaf(ctx: Ctx): TypeShape {
  const serial: Array<() => TypeShape> = [
    () => ({kind: 'number'}),
    () => ({kind: 'string'}),
    () => ({kind: 'boolean'}),
    () => ({kind: 'null'}),
    () => ({kind: 'bigint'}),
    () => ({kind: 'date'}),
    () => ({kind: 'regexp'}),
    () => ({kind: 'undefined'}),
    () => genLiteral(),
  ];
  const wild: Array<() => TypeShape> = [
    () => ({kind: 'symbol'}),
    () => ({kind: 'any'}),
    () => ({kind: 'unknown'}),
    () => ({kind: 'never'}),
    () => ({kind: 'void'}),
  ];
  // refs to enums/classes are leaf-ish
  const refLeaves = ctx.refs
    .filter((r) => r.kind === 'enum' || (ctx.opts.wild && r.kind === 'class'))
    .map((r) => () => ({kind: 'ref', name: r.name}) as TypeShape);
  const pool = ctx.opts.wild ? [...serial, ...wild, ...refLeaves] : [...serial, ...refLeaves];
  return pick(pool)();
}

function genLiteral(): TypeShape {
  const flavour = int(3);
  if (flavour === 0) return {kind: 'literal', value: pick(['on', 'off', 'red', 'green', 'A', 'B'])};
  if (flavour === 1) return {kind: 'literal', value: pick([0, 1, 7, 42, -3])};
  return {kind: 'literal', value: chance(0.5)};
}

function genTuple(ctx: Ctx, depth: number): TypeShape {
  const length = 1 + int(ctx.opts.maxBreadth);
  const elems: TypeShape[] = [];
  for (let i = 0; i < length; i++) elems.push(genShape(ctx, depth + 1));
  return {kind: 'tuple', elems};
}

function genObject(ctx: Ctx, depth: number): TypeShape {
  const props = genMembers(ctx, depth, undefined, ctx.opts.wild);
  const index = chance(0.2) ? genShape(ctx, depth + 1) : undefined;
  return {kind: 'object', props, index};
}

// Unions are kept value-level DISJOINT so the strong oracles stay sound on the
// serialisable subset: distinct literals, distinct primitive kinds, or tagged
// objects with a distinct discriminant literal.
function genUnion(ctx: Ctx, depth: number): TypeShape {
  const flavour = pick(['literals', 'primitives', 'tagged'] as const);
  const count = 2 + int(Math.max(1, ctx.opts.maxBreadth - 1));
  if (flavour === 'literals') return {kind: 'union', members: genDistinctLiterals(count)};
  if (flavour === 'primitives') return {kind: 'union', members: genDistinctPrimitives(count)};
  return {kind: 'union', members: genTaggedObjects(ctx, count, depth)};
}

function genDistinctLiterals(count: number): TypeShape[] {
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

function genDistinctPrimitives(count: number): TypeShape[] {
  const kinds: TypeShape[] = [{kind: 'string'}, {kind: 'number'}, {kind: 'boolean'}, {kind: 'bigint'}];
  const shuffled = [...kinds];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = int(i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, Math.max(2, Math.min(count, shuffled.length)));
}

function genTaggedObjects(ctx: Ctx, count: number, depth: number): TypeShape[] {
  const members: TypeShape[] = [];
  const n = Math.min(count, 4);
  for (let i = 0; i < n; i++) {
    const props: PropShape[] = [
      {name: 'kind', optional: false, readonly: false, method: false, shape: {kind: 'literal', value: `t${i}`}},
    ];
    const extra = int(ctx.opts.maxBreadth);
    for (let k = 0; k < extra; k++) {
      props.push({name: `f${k}`, optional: chance(0.3), readonly: false, method: false, shape: genShape(ctx, depth + 2)});
    }
    members.push({kind: 'object', props});
  }
  return members;
}

// Intersections of OBJECTS with DISJOINT property names per member, so the merge
// is a clean structural union (always inhabitable, and no conflicting-property
// `never`s — those send the checker into a pathological state). Mixing in a
// primitive (wild only) is a cheap `string & {…}` brand, not a conflict.
function genIntersection(ctx: Ctx, depth: number): TypeShape {
  const count = 2 + int(2);
  const members: TypeShape[] = [];
  for (let i = 0; i < count; i++) {
    const props: PropShape[] = [];
    const fields = 1 + int(ctx.opts.maxBreadth);
    for (let k = 0; k < fields; k++) {
      props.push({
        name: `m${i}_${k}`,
        optional: chance(0.3),
        readonly: chance(0.2),
        method: false,
        shape: genShape(ctx, depth + 2),
      });
    }
    members.push({kind: 'object', props});
  }
  if (ctx.opts.wild && chance(0.25)) members.push(pick<TypeShape>([{kind: 'string'}, {kind: 'number'}]));
  return {kind: 'intersection', members};
}

// =============================================================================
// Rendering — TypeShape / Decl → TS source.
// =============================================================================

function isIdent(name: string): boolean {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name);
}
function renderKey(name: string): string {
  return isIdent(name) ? name : JSON.stringify(name);
}

export function renderType(shape: TypeShape): string {
  switch (shape.kind) {
    case 'number':
    case 'string':
    case 'boolean':
    case 'bigint':
    case 'symbol':
    case 'any':
    case 'unknown':
    case 'never':
    case 'void':
      return shape.kind;
    case 'null':
      return 'null';
    case 'undefined':
      return 'undefined';
    case 'date':
      return 'Date';
    case 'regexp':
      return 'RegExp';
    case 'literal':
      return typeof shape.value === 'string' ? JSON.stringify(shape.value) : String(shape.value);
    case 'array':
      return `Array<${renderType(shape.elem)}>`;
    case 'tuple':
      return `[${shape.elems.map(renderType).join(', ')}]`;
    case 'record':
      return `Record<string, ${renderType(shape.value)}>`;
    case 'map':
      return `Map<${renderType(shape.key)}, ${renderType(shape.value)}>`;
    case 'set':
      return `Set<${renderType(shape.elem)}>`;
    case 'promise':
      return `Promise<${renderType(shape.value)}>`;
    case 'function':
      return `((${shape.params.map((p, i) => `a${i}: ${renderType(p)}`).join(', ')}) => ${renderType(shape.ret)})`;
    case 'ref':
      return shape.name;
    case 'union':
      return `(${shape.members.map(renderType).join(' | ')})`;
    case 'intersection':
      return `(${shape.members.map(renderType).join(' & ')})`;
    case 'object': {
      const parts = shape.props.map(renderProp);
      if (shape.index) parts.push(`[k: string]: ${renderType(shape.index)}`);
      return parts.length ? `{${parts.join('; ')}}` : '{}';
    }
  }
}

function renderProp(prop: PropShape): string {
  const ro = prop.readonly ? 'readonly ' : '';
  const opt = prop.optional ? '?' : '';
  if (prop.method && prop.shape.kind === 'function') {
    const fn = prop.shape;
    return `${ro}${renderKey(prop.name)}${opt}(${fn.params.map((p, i) => `a${i}: ${renderType(p)}`).join(', ')}): ${renderType(fn.ret)}`;
  }
  return `${ro}${renderKey(prop.name)}${opt}: ${renderType(prop.shape)}`;
}

export function renderDecl(decl: Decl): string {
  switch (decl.kind) {
    case 'interface':
      return `interface ${decl.name} {${decl.props.map(renderProp).join('; ')}}`;
    case 'type':
      return `type ${decl.name} = ${renderType(decl.shape)};`;
    case 'class':
      // `declare class` — type-only, no method bodies needed for the scan.
      return `declare class ${decl.name} {${decl.props.map(renderProp).join('; ')}}`;
    case 'enum':
      return `enum ${decl.name} {${decl.members
        .map((m) =>
          m.value === undefined ? m.name : `${m.name} = ${typeof m.value === 'string' ? JSON.stringify(m.value) : m.value}`
        )
        .join(', ')}}`;
  }
}

/** Render the decls block + the root type expression for a generated type. **/
export function renderGenerated(gen: GeneratedType): {decls: string; rootExpr: string} {
  return {decls: gen.decls.map(renderDecl).join('\n'), rootExpr: renderType(gen.root)};
}

/** Short human-readable summary for titles / logs. **/
export function describeType(gen: GeneratedType): string {
  const d = gen.decls.length ? `[${gen.decls.length}d] ` : '';
  return d + describeShape(gen.root);
}

export function describeShape(shape: TypeShape, depth = 0): string {
  if (depth > 2) return '…';
  switch (shape.kind) {
    case 'array':
      return `${describeShape(shape.elem, depth + 1)}[]`;
    case 'tuple':
      return `[${shape.elems.map((s) => describeShape(s, depth + 1)).join(',')}]`;
    case 'object':
      return `{${shape.props.length}${shape.index ? '+idx' : ''}}`;
    case 'record':
      return `Rec<${describeShape(shape.value, depth + 1)}>`;
    case 'map':
      return `Map<${describeShape(shape.key, depth + 1)},${describeShape(shape.value, depth + 1)}>`;
    case 'set':
      return `Set<${describeShape(shape.elem, depth + 1)}>`;
    case 'promise':
      return `Promise<${describeShape(shape.value, depth + 1)}>`;
    case 'function':
      return `fn(${shape.params.length})`;
    case 'union':
      return `(${shape.members.map((s) => describeShape(s, depth + 1)).join('|')})`;
    case 'intersection':
      return `(${shape.members.map((s) => describeShape(s, depth + 1)).join('&')})`;
    case 'literal':
      return typeof shape.value === 'string' ? `'${shape.value}'` : String(shape.value);
    case 'ref':
      return shape.name;
    default:
      return shape.kind;
  }
}

// --- ref-graph analysis (recursion detection) ---

function collectRefs(shape: TypeShape, out: Set<string>): void {
  switch (shape.kind) {
    case 'ref':
      out.add(shape.name);
      return;
    case 'array':
    case 'set':
      return collectRefs(shape.elem, out);
    case 'record':
    case 'promise':
      return collectRefs(shape.value, out);
    case 'map':
      collectRefs(shape.key, out);
      collectRefs(shape.value, out);
      return;
    case 'tuple':
      shape.elems.forEach((s) => collectRefs(s, out));
      return;
    case 'union':
    case 'intersection':
      shape.members.forEach((s) => collectRefs(s, out));
      return;
    case 'function':
      shape.params.forEach((s) => collectRefs(s, out));
      collectRefs(shape.ret, out);
      return;
    case 'object':
      shape.props.forEach((p) => collectRefs(p.shape, out));
      if (shape.index) collectRefs(shape.index, out);
      return;
  }
}

function declRefs(decl: Decl): Set<string> {
  const out = new Set<string>();
  if (decl.kind === 'interface' || decl.kind === 'class') decl.props.forEach((p) => collectRefs(p.shape, out));
  else if (decl.kind === 'type') collectRefs(decl.shape, out);
  return out;
}

/** True when the type's declarations contain a reference cycle (a recursive /
 *  circular type). The in-process harness linker can't faithfully execute a
 *  cyclic function graph (the real pipeline's CircularRefs suite covers that),
 *  so the runner restricts recursive types to the resolver/emit oracles. **/
export function isRecursive(gen: GeneratedType): boolean {
  const byName = new Map(gen.decls.map((d) => [d.name, d] as const));
  const reachesSelf = (start: string): boolean => {
    const seen = new Set<string>();
    const stack = [...declRefs(byName.get(start)!)];
    while (stack.length) {
      const name = stack.pop()!;
      if (name === start) return true;
      if (seen.has(name) || !byName.has(name)) continue;
      seen.add(name);
      for (const ref of declRefs(byName.get(name)!)) stack.push(ref);
    }
    return false;
  };
  return gen.decls.some((d) => (d.kind === 'interface' || d.kind === 'class' || d.kind === 'type') && reachesSelf(d.name));
}

/** Total node count across decls + root — used by tests to bound size. **/
export function countNodes(gen: GeneratedType): number {
  let total = 0;
  const walk = (shape: TypeShape): void => {
    total++;
    switch (shape.kind) {
      case 'array':
      case 'set':
        walk(shape.kind === 'array' ? shape.elem : shape.elem);
        break;
      case 'record':
      case 'promise':
        walk(shape.value);
        break;
      case 'map':
        walk(shape.key);
        walk(shape.value);
        break;
      case 'tuple':
        shape.elems.forEach(walk);
        break;
      case 'union':
      case 'intersection':
        shape.members.forEach(walk);
        break;
      case 'function':
        shape.params.forEach(walk);
        walk(shape.ret);
        break;
      case 'object':
        shape.props.forEach((p) => walk(p.shape));
        if (shape.index) walk(shape.index);
        break;
    }
  };
  for (const decl of gen.decls) {
    if (decl.kind === 'interface' || decl.kind === 'class') decl.props.forEach((p) => walk(p.shape));
    else if (decl.kind === 'type') walk(decl.shape);
    else total++;
  }
  walk(gen.root);
  return total;
}
