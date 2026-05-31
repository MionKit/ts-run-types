// value-first define — every VALUE_FIRST_SUITE case run through isType (static + reflect +
// deserialize + schema forms) and a light getTypeErrors check (valid → no errors, invalid → ≥1
// error). One `it()` per function, inlined directly (no shared util helper). Proves the value-first
// authoring surface lowers to the same RunType graph as type-first (hash-level convergence is
// asserted separately in test/adapters/valueFirstConvergence.test.ts).
import {describe, expect, it} from 'vitest';
import {VALUE_FIRST_SUITE} from './index.ts';
import type {ValidationCase} from '../validation/types.ts';

const warnedValueFirstUnsupported = new Set<string>();

describe('value-first define', () => {
  for (const c of Object.values(VALUE_FIRST_SUITE) as ValidationCase[]) {
    it(`isType — ${c.title}`, () => {
      if (!c.isType) throw new Error(`case ${c.title}: missing isType thunk`);

      if (c.valueFirstUnsupported && !warnedValueFirstUnsupported.has(c.title)) {
        warnedValueFirstUnsupported.add(c.title);
        console.warn(
          `[value-first-unsupported] case "${c.title}" cannot be authored value-first: the ` +
            `\`${c.valueFirstUnsupported}\` option (and \`noLiterals\`) is folded into the structural ` +
            `typeId at the createIsType call site (internal/resolver/scan.go — noLiterals walks a literal ` +
            `to its base type, noIsArrayCheck wraps the array id with a flag), but value-first builders ` +
            `carry only the TS type via InjectRunTypeId<T>, so options can't ride the value-first surface. ` +
            `DESIGN FLAW to fix: move RunTypeOptions out of the typeId computation so these options become ` +
            `authorable value-first.`
        );
      }

      if (c.factoryThrows) {
        expect(() => c.isType!(), `${c.title} [static]: factory must throw`).toThrow();
        if (c.isTypeReflect) expect(() => c.isTypeReflect!(), `${c.title} [reflect]: factory must throw`).toThrow();
        if (c.deserializeIsType)
          expect(() => c.deserializeIsType!(), `${c.title} [deserialize-static]: factory must throw`).toThrow();
        if (c.deserializeIsTypeReflect)
          expect(() => c.deserializeIsTypeReflect!(), `${c.title} [deserialize-reflect]: factory must throw`).toThrow();
        return;
      }

      const {valid, invalid} = c.getSamples();

      const isTypeStatic = c.isType();
      valid.forEach((v, i) => {
        expect(isTypeStatic(v), `${c.title} [static]: valid[${i}] should pass`).toBe(true);
      });
      invalid.forEach((v, i) => {
        expect(isTypeStatic(v), `${c.title} [static]: invalid[${i}] should fail`).toBe(false);
      });

      if (c.isTypeReflect) {
        const isTypeReflect = c.isTypeReflect();
        valid.forEach((v, i) => {
          expect(isTypeReflect(v), `${c.title} [reflect]: valid[${i}] should pass`).toBe(true);
        });
        invalid.forEach((v, i) => {
          expect(isTypeReflect(v), `${c.title} [reflect]: invalid[${i}] should fail`).toBe(false);
        });
      }

      if (c.deserializeIsType) {
        const deserializedStatic = c.deserializeIsType();
        valid.forEach((v, i) => {
          expect(deserializedStatic(v), `${c.title} [deserialize-static]: valid[${i}] should pass`).toBe(true);
        });
        invalid.forEach((v, i) => {
          expect(deserializedStatic(v), `${c.title} [deserialize-static]: invalid[${i}] should fail`).toBe(false);
        });
      }

      if (c.deserializeIsTypeReflect) {
        const deserializedReflect = c.deserializeIsTypeReflect();
        valid.forEach((v, i) => {
          expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: valid[${i}] should pass`).toBe(true);
        });
        invalid.forEach((v, i) => {
          expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: invalid[${i}] should fail`).toBe(false);
        });
      }

      if (c.isTypeSchema) {
        const isTypeSchema = c.isTypeSchema();
        valid.forEach((v, i) => {
          expect(isTypeSchema(v), `${c.title} [schema]: valid[${i}] should pass`).toBe(true);
        });
        invalid.forEach((v, i) => {
          expect(isTypeSchema(v), `${c.title} [schema]: invalid[${i}] should fail`).toBe(false);
        });
      }
    });

    it(`getTypeErrors — ${c.title}`, () => {
      if (!c.getTypeErrors) throw new Error(`case ${c.title}: missing getTypeErrors thunk`);
      const {valid, invalid} = c.getSamples();
      const getErr = c.getTypeErrors();
      valid.forEach((v, i) => {
        expect(getErr(v), `${c.title} [getTypeErrors]: valid[${i}] → no errors`).toEqual([]);
      });
      invalid.forEach((v, i) => {
        expect(getErr(v).length, `${c.title} [getTypeErrors]: invalid[${i}] → ≥1 error`).toBeGreaterThan(0);
      });
    });
  }
});
