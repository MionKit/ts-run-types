// validation / TemplateLiteral — every TEMPLATE_LITERAL case run through isType, getTypeErrors, and mockType.
// The per-case assertion logic is inlined directly in each `it()` body (no shared util helper):
// each form (static / reflect / deserialize / schema) is exercised against the case's samples.
import {describe, expect, it} from 'vitest';
import {TEMPLATE_LITERAL} from './TemplateLiteral.ts';
import type {ValidationCase} from './types.ts';

const MOCK_ITERATIONS = 20;
const warnedValueFirstUnsupported = new Set<string>();

describe('validation / TemplateLiteral', () => {
  for (const c of Object.values(TEMPLATE_LITERAL) as ValidationCase[]) {
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

      if (c.factoryThrows) {
        expect(() => c.getTypeErrors!(), `${c.title} [static]: factory must throw`).toThrow();
        if (c.getTypeErrorsReflect) expect(() => c.getTypeErrorsReflect!(), `${c.title} [reflect]: factory must throw`).toThrow();
        if (c.deserializeGetTypeErrors)
          expect(() => c.deserializeGetTypeErrors!(), `${c.title} [deserialize-static]: factory must throw`).toThrow();
        if (c.deserializeGetTypeErrorsReflect)
          expect(() => c.deserializeGetTypeErrorsReflect!(), `${c.title} [deserialize-reflect]: factory must throw`).toThrow();
        return;
      }

      if (!c.getExpectedErrors) throw new Error(`case ${c.title}: missing getExpectedErrors thunk`);
      const {valid, invalid} = c.getSamples();
      const expected = c.getExpectedErrors();

      if (expected.length !== invalid.length) {
        throw new Error(
          `case ${c.title}: getExpectedErrors length (${expected.length}) must match invalid samples (${invalid.length})`
        );
      }

      const getErrStatic = c.getTypeErrors();
      valid.forEach((v, i) => {
        expect(getErrStatic(v), `${c.title} [static]: valid[${i}] → no errors`).toEqual([]);
      });
      invalid.forEach((v, i) => {
        expect(getErrStatic(v), `${c.title} [static]: invalid[${i}]`).toEqual(expected[i]);
      });

      if (c.getTypeErrorsReflect) {
        const getErrReflect = c.getTypeErrorsReflect();
        valid.forEach((v, i) => {
          expect(getErrReflect(v), `${c.title} [reflect]: valid[${i}] → no errors`).toEqual([]);
        });
        invalid.forEach((v, i) => {
          expect(getErrReflect(v), `${c.title} [reflect]: invalid[${i}]`).toEqual(expected[i]);
        });
      }

      if (c.deserializeGetTypeErrors) {
        const deserializedStatic = c.deserializeGetTypeErrors();
        valid.forEach((v, i) => {
          expect(deserializedStatic(v), `${c.title} [deserialize-static]: valid[${i}] → no errors`).toEqual([]);
        });
        invalid.forEach((v, i) => {
          expect(deserializedStatic(v), `${c.title} [deserialize-static]: invalid[${i}]`).toEqual(expected[i]);
        });
      }

      if (c.deserializeGetTypeErrorsReflect) {
        const deserializedReflect = c.deserializeGetTypeErrorsReflect();
        valid.forEach((v, i) => {
          expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: valid[${i}] → no errors`).toEqual([]);
        });
        invalid.forEach((v, i) => {
          expect(deserializedReflect(v), `${c.title} [deserialize-reflect]: invalid[${i}]`).toEqual(expected[i]);
        });
      }

      if (c.getTypeErrorsSchema) {
        const getErrSchema = c.getTypeErrorsSchema();
        valid.forEach((v, i) => {
          expect(getErrSchema(v), `${c.title} [schema]: valid[${i}] → no errors`).toEqual([]);
        });
        invalid.forEach((v, i) => {
          expect(getErrSchema(v).length, `${c.title} [schema]: invalid[${i}] → at least one error`).toBeGreaterThan(0);
        });
      }
    });

    it(`mockType — ${c.title}`, () => {
      if (!c.mockType) throw new Error(`case ${c.title}: missing mockType thunk`);

      const expectMode = c.factoryThrows ? 'skip' : (c.mockTypeExpect ?? 'value');

      if (expectMode === 'throw') {
        const mockFn = c.mockType();
        expect(() => mockFn(), `${c.title} [static]: mock fn should throw`).toThrow();
        if (c.mockTypeReflect) {
          const mockFnReflect = c.mockTypeReflect();
          expect(() => mockFnReflect(), `${c.title} [reflect]: mock fn should throw`).toThrow();
        }
        return;
      }

      if (expectMode !== 'skip' && !c.isType) {
        throw new Error(`case ${c.title}: mockType needs paired isType thunk to validate`);
      }

      const mockPasses: Array<{mockFn: () => unknown; label: string}> = [{mockFn: c.mockType(), label: 'static'}];
      if (c.mockTypeReflect) mockPasses.push({mockFn: c.mockTypeReflect(), label: 'reflect'});

      for (const {mockFn, label} of mockPasses) {
        if (expectMode === 'skip') {
          for (let i = 0; i < MOCK_ITERATIONS; i++) mockFn();
          continue;
        }
        const isValid = c.isType!();
        for (let i = 0; i < MOCK_ITERATIONS; i++) {
          const generated = mockFn();
          if (!isValid(generated)) {
            let valStr: string;
            try {
              valStr = JSON.stringify(generated, (_k, v) =>
                typeof v === 'bigint' ? `${v}n` : typeof v === 'symbol' ? v.toString() : v
              );
            } catch {
              valStr = String(generated);
            }
            throw new Error(`${c.title} [${label}]: iteration ${i} — generated value did not pass isType. value=${valStr}`);
          }
        }
      }
    });
  }
});
