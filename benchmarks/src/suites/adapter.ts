// Flattens the real validation + format-validation suites into a single list
// of benchmark cases. ts-go-run-types validators come straight from each case's
// `validate` thunk (rewritten at build time by the plugin); samples come from
// each case's `getSamples()`.

import {VALIDATION_SUITE} from './validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from './format-validation/index.ts';
import type {ValidationCase} from './validation/types.ts';
import {NOT_SUPPORTED, type ValidatorOrUnsupported} from '../types.ts';

export interface FlatCase {
  key: string; // "GROUP.case"
  suite: 'validation' | 'format-validation';
  group: string;
  name: string;
  samples: {valid: unknown[]; invalid: unknown[]};
  tsValidate: ValidatorOrUnsupported;
}

type SuiteShape = Record<string, Record<string, ValidationCase>>;

function flatten(suite: SuiteShape, suiteName: FlatCase['suite']): FlatCase[] {
  const out: FlatCase[] = [];
  for (const [group, cases] of Object.entries(suite)) {
    for (const [name, def] of Object.entries(cases)) {
      let samples: {valid: unknown[]; invalid: unknown[]};
      try {
        samples = def.getSamples();
      } catch {
        // A case whose sample factory throws can't be benchmarked — skip it.
        continue;
      }

      let tsValidate: ValidatorOrUnsupported = NOT_SUPPORTED;
      // factoryThrows cases render an alwaysThrow factory: unsupported at root.
      if (!def.factoryThrows && def.validate !== NOT_SUPPORTED) {
        try {
          tsValidate = (def.validate as () => (v: unknown) => boolean)();
        } catch {
          tsValidate = NOT_SUPPORTED;
        }
      }

      out.push({key: `${group}.${name}`, suite: suiteName, group, name, samples, tsValidate});
    }
  }
  return out;
}

export const VALIDATION_CASES = flatten(VALIDATION_SUITE as unknown as SuiteShape, 'validation');
export const FORMAT_CASES = flatten(
  FORMAT_VALIDATION_SUITE as unknown as SuiteShape,
  'format-validation',
);
export const ALL_CASES = [...VALIDATION_CASES, ...FORMAT_CASES];
