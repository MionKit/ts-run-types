// A small random TypeScript type generator for the playground's "Random type"
// button. Deliberately produces clean, JSON-friendly DTOs (objects, primitives,
// string-literal unions, arrays, optionals, shallow nested objects) so the
// generated type round-trips through the JSON input pane, createMockType, and the
// validators/serializers. (The repo's fuzz generator in ts-runtypes/test covers
// the adversarial space — symbols, functions, Map/Set/Date, never — which is not
// what we want to demo here.) Type form only; the caller switches to TS-type mode.

import {ROOT_TYPE} from '../core/index.ts';

const NUM_NAMES = ['id', 'count', 'total', 'price', 'quantity', 'score', 'rating', 'views', 'likes', 'age', 'amount'];
const BOOL_NAMES = ['active', 'enabled', 'published', 'verified', 'featured', 'inStock', 'archived'];
const STR_NAMES = ['name', 'email', 'title', 'slug', 'description', 'url', 'author', 'createdAt', 'updatedAt', 'sku', 'city'];
const ARR_NAMES = ['tags', 'labels', 'roles', 'categories', 'keywords', 'items'];
const OBJ_NAMES = ['meta', 'profile', 'address', 'owner', 'details', 'settings'];
const UNIONS: Record<string, string[]> = {
  status: ['pending', 'active', 'archived'],
  role: ['admin', 'editor', 'user'],
  priority: ['low', 'medium', 'high'],
  currency: ['USD', 'EUR', 'GBP'],
  size: ['small', 'medium', 'large'],
};

const rnd = (): number => Math.random();
const int = (n: number): number => Math.floor(rnd() * n);
const pick = <T>(items: readonly T[]): T => items[int(items.length)];
const chance = (p: number): boolean => rnd() < p;

interface Field {
  name: string;
  type: string;
}

// buildField picks a category and produces one realistic field. Nested objects
// and object arrays are only emitted above the depth cap.
function buildField(depth: number): Field {
  const categories =
    depth >= 2 ? ['num', 'bool', 'str', 'arr', 'union'] : ['num', 'bool', 'str', 'arr', 'union', 'obj', 'arrObj'];
  switch (pick(categories)) {
    case 'bool':
      return {name: pick(BOOL_NAMES), type: 'boolean'};
    case 'str':
      return {name: pick(STR_NAMES), type: 'string'};
    case 'arr':
      return {name: pick(ARR_NAMES), type: chance(0.5) ? 'string[]' : 'number[]'};
    case 'union': {
      const key = pick(Object.keys(UNIONS));
      return {name: key, type: UNIONS[key].map((v) => `'${v}'`).join(' | ')};
    }
    case 'obj':
      return {name: pick(OBJ_NAMES), type: inlineObject(depth + 1)};
    case 'arrObj':
      return {name: pick(ARR_NAMES), type: `${inlineObject(depth + 1)}[]`};
    default:
      return {name: pick(NUM_NAMES), type: 'number'};
  }
}

function pickFields(count: number, depth: number): Field[] {
  const out: Field[] = [];
  const used = new Set<string>();
  for (let guard = 0; out.length < count && guard < count * 6; guard++) {
    const field = buildField(depth);
    if (used.has(field.name)) continue;
    used.add(field.name);
    out.push(field);
  }
  return out;
}

function renderField(field: Field, optional: boolean): string {
  return `${field.name}${optional ? '?' : ''}: ${field.type}`;
}

function inlineObject(depth: number): string {
  const fields = pickFields(2 + int(2), depth);
  return `{ ${fields.map((f) => renderField(f, chance(0.2))).join('; ')} }`;
}

/** A fresh, clean, JSON-friendly `type ${ROOT_TYPE} = { … }` definition. */
export function randomTypeDefinition(): string {
  const body = pickFields(3 + int(4), 0)
    .map((f) => `  ${renderField(f, chance(0.25))};`)
    .join('\n');
  return `type ${ROOT_TYPE} = {\n${body}\n};`;
}
