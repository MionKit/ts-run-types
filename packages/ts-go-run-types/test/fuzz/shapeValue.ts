// Phase 2 value layer — generate a CONFORMING value for a TypeShape, and
// corrupt one to a provably-invalid one. The Phase-1 streams (mockType.ts /
// invalidValue.ts) operate over a runtime RunType graph; here we already hold
// the abstract shape, so we generate both streams directly from it — no
// dependency on the reflection cache or `createMockType`.
//
// Both functions draw from the global `Math.random`, so the same seed that
// produced the shape (typeGen.ts) reproduces its value stream too.
//
// SOUNDNESS CONTRACT (mirrors invalidValue.ts, one-directional):
//   When `corruptValue` returns a value, `validate<T>` on it MUST be false.
// To guarantee that, corruption only ever targets a position whose kind is
// provably-invalidatable in isolation, and never descends through a `union`
// (where a sibling member could re-accept the mutated value). A false negative
// (returning null) only costs coverage; a false positive would be a spurious
// O2 failure.

import type {TypeShape} from './typeGen.ts';

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

const STRINGS = ['', 'a', 'hello world', 'with "quotes"', 'líne\nbreak', '🦊 unicode', 'tab\tsep', '0', 'null', '{}'];

/** A finite (never NaN/Infinity) number — keeps JSON/binary round-trips exact
 *  for the strong oracles. **/
function finiteNumber(): number {
  const flavour = int(4);
  if (flavour === 0) return int(1000) - 500;
  if (flavour === 1) return 0;
  if (flavour === 2) return (int(2) ? 1 : -1) * rnd() * 1e6;
  return (int(2) ? 1 : -1) * rnd();
}

/** Generate a value that conforms to `shape`. **/
export function validValue(shape: TypeShape): unknown {
  switch (shape.kind) {
    case 'number':
      return finiteNumber();
    case 'string':
      return pick(STRINGS);
    case 'boolean':
      return chance(0.5);
    case 'bigint':
      return BigInt(int(1_000_000)) * BigInt(int(2) ? 1 : -1);
    case 'null':
      return null;
    case 'date':
      // Bounded, always-valid Date (avoid Invalid Date which fails validation).
      return new Date(Date.UTC(2000 + int(40), int(12), 1 + int(28), int(24), int(60), int(60)));
    case 'literal':
      return shape.value;
    case 'array': {
      const length = int(4);
      const out: unknown[] = [];
      for (let i = 0; i < length; i++) out.push(validValue(shape.elem));
      return out;
    }
    case 'tuple':
      return shape.elems.map(validValue);
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const prop of shape.props) {
        // Optional props are sometimes omitted entirely (the data-only,
        // dropped-key shape) and otherwise carry a conforming value.
        if (prop.optional && chance(0.4)) continue;
        out[prop.name] = validValue(prop.shape);
      }
      return out;
    }
    case 'union':
      return validValue(pick(shape.members));
  }
}

// A value of a kind DISJOINT from `shape`: a number where the shape accepts
// strings, a string otherwise. Sound for every non-union kind — see the file
// header. (Validators reject the cross-typed value: a number validator rejects
// a string and vice-versa; object/array/tuple/date/null/bigint all reject a
// bare string; a string literal rejects a number.)
function disjointValue(shape: TypeShape): unknown {
  const acceptsString = shape.kind === 'string' || (shape.kind === 'literal' && typeof shape.value === 'string');
  return acceptsString ? 1234567 : '__invalid__';
}

interface CorruptionSite {
  shape: TypeShape;
  set: (replacement: unknown) => void;
}

// Walk the (shape, value) pair collecting every position that can be corrupted
// in isolation. Union subtrees are skipped wholesale (not provably invalidatable
// — a sibling member may re-accept), as are omitted optional props.
function collectSites(shape: TypeShape, value: unknown, set: (v: unknown) => void, out: CorruptionSite[]): void {
  if (shape.kind === 'union') return;
  out.push({shape, set});
  if (shape.kind === 'object' && value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    for (const prop of shape.props) {
      if (!Object.prototype.hasOwnProperty.call(obj, prop.name)) continue; // omitted optional
      collectSites(prop.shape, obj[prop.name], (v) => (obj[prop.name] = v), out);
    }
  } else if (shape.kind === 'array' && Array.isArray(value)) {
    const arr = value as unknown[];
    for (let i = 0; i < arr.length; i++) collectSites(shape.elem, arr[i], (v) => (arr[i] = v), out);
  } else if (shape.kind === 'tuple' && Array.isArray(value)) {
    const arr = value as unknown[];
    for (let i = 0; i < shape.elems.length; i++) collectSites(shape.elems[i], arr[i], (v) => (arr[i] = v), out);
  }
}

export interface Corruption {
  value: unknown;
  /** Always true here — every collected site is provably-invalid (see contract).
   *  Kept for parity with invalidValue.ts and forward-compatibility. **/
  proven: boolean;
}

/** Corrupt a valid value at exactly one provably-invalid position. Returns null
 *  when no such position exists (e.g. a top-level union). The input is not
 *  mutated — a structured clone is corrupted and returned. **/
export function corruptValue(shape: TypeShape, value: unknown): Corruption | null {
  const clone = structuredClone(value);
  const holder = {root: clone};
  const sites: CorruptionSite[] = [];
  collectSites(shape, clone, (v) => (holder.root = v), sites);
  if (sites.length === 0) return null;
  const site = sites[int(sites.length)];
  site.set(disjointValue(site.shape));
  return {value: holder.root, proven: true};
}
