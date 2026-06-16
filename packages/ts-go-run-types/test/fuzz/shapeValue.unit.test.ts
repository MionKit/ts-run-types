// Offline unit tests for the Phase-2 value layer. Pins the soundness contract
// the O1/O2 oracles depend on, using a structural validator built directly from
// the shape (independent of the runtime emitter — so this test stays offline
// AND cross-checks the generated values against an independent reference).

import {describe, it, expect} from 'vitest';
import {withSeededRandom, mixSeed} from './seededRng.ts';
import {genShape, type TypeShape} from './typeGen.ts';
import {validValue, corruptValue} from './shapeValue.ts';

// A reference structural validator. Deliberately NOT the library's emitter — an
// independent oracle for the generated values. Unions accept any member.
function conforms(shape: TypeShape, value: unknown): boolean {
  switch (shape.kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return typeof value === 'string';
    case 'boolean':
      return typeof value === 'boolean';
    case 'bigint':
      return typeof value === 'bigint';
    case 'null':
      return value === null;
    case 'date':
      return value instanceof Date && !Number.isNaN(value.getTime());
    case 'literal':
      return value === shape.value;
    case 'array':
      return Array.isArray(value) && value.every((v) => conforms(shape.elem, v));
    case 'tuple':
      return Array.isArray(value) && value.length === shape.elems.length && shape.elems.every((s, i) => conforms(s, value[i]));
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
      const obj = value as Record<string, unknown>;
      for (const prop of shape.props) {
        const present = Object.prototype.hasOwnProperty.call(obj, prop.name);
        if (!present) {
          if (!prop.optional) return false;
          continue;
        }
        if (!conforms(prop.shape, obj[prop.name])) return false;
      }
      return true;
    }
    case 'union':
      return shape.members.some((m) => conforms(m, value));
  }
}

describe('shapeValue — validValue conforms', () => {
  it('every generated value conforms to its shape (reference validator)', () => {
    for (let i = 0; i < 400; i++) {
      withSeededRandom(mixSeed(0x222, 'valid', i), () => {
        const shape = genShape();
        const value = validValue(shape);
        expect(conforms(shape, value), `shape=${JSON.stringify(shape)} value=${String(value)}`).toBe(true);
      });
    }
  });
});

describe('shapeValue — corruptValue is sound', () => {
  it('a corruption is always rejected by the reference validator', () => {
    let corruptedCount = 0;
    for (let i = 0; i < 400; i++) {
      withSeededRandom(mixSeed(0x333, 'corrupt', i), () => {
        const shape = genShape();
        const valid = validValue(shape);
        const corrupted = corruptValue(shape, valid);
        if (!corrupted) return; // null is allowed (e.g. top-level union) — only costs coverage
        corruptedCount++;
        // SOUNDNESS: a returned corruption must NOT conform.
        expect(conforms(shape, corrupted.value), `shape=${JSON.stringify(shape)} corrupted=${String(corrupted.value)}`).toBe(
          false
        );
        // The original valid value must be untouched (corruption clones).
        expect(conforms(shape, valid)).toBe(true);
      });
    }
    // Sanity: the corruptor actually fires for the vast majority of shapes.
    expect(corruptedCount).toBeGreaterThan(300);
  });
});
