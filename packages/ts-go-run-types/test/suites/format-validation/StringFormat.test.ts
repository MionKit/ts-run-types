// format-validation / StringFormat — every STRING_FORMAT case run through isType, getTypeErrors,
// and mockType. The per-case logic is inlined directly in each `it()` body (no shared util helper);
// getTypeErrors matches on the `format` payload (name / val / formatPath tail), not a deep-equal.
import {describe, expect, it} from 'vitest';
import {STRING_FORMAT} from './StringFormat.ts';
import type {FormatValidationCase} from './types.ts';

const MOCK_ITERATIONS = 20;
const warnedValueFirstUnsupported = new Set<string>();

describe('format-validation / StringFormat', () => {
  for (const c of Object.values(STRING_FORMAT) as FormatValidationCase[]) {
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
      if (!c.expectedFormatErrors) throw new Error(`case ${c.title}: missing expectedFormatErrors thunk`);

      const {valid, invalid} = c.getSamples();
      const expected = c.expectedFormatErrors();
      if (expected.length !== invalid.length) {
        throw new Error(
          `case ${c.title}: expectedFormatErrors length (${expected.length}) must match invalid samples (${invalid.length})`
        );
      }

      const getErr = c.getTypeErrors();

      valid.forEach((v, i) => {
        expect(getErr(v), `${c.title}: valid[${i}] → no errors`).toEqual([]);
      });

      invalid.forEach((v, i) => {
        const errors = getErr(v);
        expect(errors.length, `${c.title}: invalid[${i}] should produce at least one error`).toBeGreaterThan(0);

        const exp = expected[i];
        if (!exp) return;

        const formatErr = errors.find((entry) => entry.format?.name === exp.name)?.format;
        expect(formatErr, `${c.title}: invalid[${i}] should carry a '${exp.name}' format error`).toBeDefined();

        if (exp.val !== undefined) {
          expect(formatErr?.val, `${c.title}: invalid[${i}] format.val`).toEqual(exp.val);
        }
        if (exp.formatPathTail !== undefined) {
          const path = formatErr?.formatPath;
          expect(path?.[path.length - 1], `${c.title}: invalid[${i}] format.formatPath tail`).toBe(exp.formatPathTail);
        }
      });
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
