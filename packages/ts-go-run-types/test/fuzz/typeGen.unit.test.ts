// Offline unit tests for the Phase-2 type generator — no Go binary, no plugin.
// Pins the two properties the harness relies on: determinism (a seed reproduces
// the exact shape) and well-formedness (rendered source is bounded and the
// kinds stay inside the serialisable set).

import {describe, it, expect} from 'vitest';
import {withSeededRandom, mixSeed} from './seededRng.ts';
import {genShape, renderType, describeShape, countNodes, DEFAULT_GEN_OPTIONS, type TypeShape} from './typeGen.ts';

const SERIALISABLE_KINDS = new Set([
  'number',
  'string',
  'boolean',
  'bigint',
  'null',
  'date',
  'literal',
  'array',
  'tuple',
  'object',
  'union',
]);

function everyNode(shape: TypeShape, visit: (s: TypeShape) => void): void {
  visit(shape);
  if (shape.kind === 'array') everyNode(shape.elem, visit);
  else if (shape.kind === 'tuple') shape.elems.forEach((s) => everyNode(s, visit));
  else if (shape.kind === 'object') shape.props.forEach((p) => everyNode(p.shape, visit));
  else if (shape.kind === 'union') shape.members.forEach((s) => everyNode(s, visit));
}

describe('typeGen — determinism', () => {
  it('reproduces the identical shape from the same seed', () => {
    for (let i = 0; i < 50; i++) {
      const seed = mixSeed(0x1234, 'det', i);
      const a = withSeededRandom(seed, () => genShape());
      const b = withSeededRandom(seed, () => genShape());
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('produces different shapes for different seeds (not degenerate)', () => {
    const rendered = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const shape = withSeededRandom(mixSeed(0x99, 'spread', i), () => genShape());
      rendered.add(renderType(shape));
    }
    // A healthy generator yields lots of distinct shapes across 60 seeds.
    expect(rendered.size).toBeGreaterThan(20);
  });
});

describe('typeGen — well-formedness', () => {
  it('only emits serialisable kinds and respects the depth/breadth bounds', () => {
    for (let i = 0; i < 200; i++) {
      const shape = withSeededRandom(mixSeed(0xabc, 'wf', i), () => genShape(DEFAULT_GEN_OPTIONS));
      everyNode(shape, (node) => {
        expect(SERIALISABLE_KINDS.has(node.kind)).toBe(true);
        if (node.kind === 'union') expect(node.members.length).toBeGreaterThanOrEqual(2);
        if (node.kind === 'object') {
          const names = node.props.map((p) => p.name);
          expect(new Set(names).size).toBe(names.length); // no duplicate keys
        }
      });
      // Bounded so the resolver never chokes on a pathological tree.
      expect(countNodes(shape)).toBeLessThan(400);
    }
  });

  it('renders syntactically balanced TS type expressions', () => {
    for (let i = 0; i < 100; i++) {
      const shape = withSeededRandom(mixSeed(0xdef, 'render', i), () => genShape());
      const ts = renderType(shape);
      expect(ts.length).toBeGreaterThan(0);
      expect(balanced(ts)).toBe(true);
      expect(describeShape(shape).length).toBeGreaterThan(0);
    }
  });

  it('honours kind toggles (no date/bigint/unions when disabled)', () => {
    for (let i = 0; i < 100; i++) {
      const shape = withSeededRandom(mixSeed(0x55, 'toggle', i), () =>
        genShape({...DEFAULT_GEN_OPTIONS, date: false, bigint: false, unions: false})
      );
      everyNode(shape, (node) => {
        expect(node.kind).not.toBe('date');
        expect(node.kind).not.toBe('bigint');
        expect(node.kind).not.toBe('union');
      });
    }
  });
});

// Balanced brackets/quotes — a cheap structural sanity check on rendered source.
function balanced(text: string): boolean {
  const stack: string[] = [];
  const pairs: Record<string, string> = {')': '(', ']': '[', '}': '{'};
  let inStr: string | null = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === '\\') i++;
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === '(' || ch === '[' || ch === '{') stack.push(ch);
    else if (ch === ')' || ch === ']' || ch === '}') {
      if (stack.pop() !== pairs[ch]) return false;
    }
  }
  return stack.length === 0 && inStr === null;
}
