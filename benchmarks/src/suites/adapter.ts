// Flattens the real validation + format-validation suites into a single list
// of benchmark cases. ts-go-run-types validators come straight from each case's
// `validate` thunk (rewritten at build time by the plugin); samples come from
// each case's `getSamples()`.

import {VALIDATION_SUITE} from './validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from './format-validation/index.ts';
import {REALWORLD} from './realworld/index.ts';
import type {ValidationCase} from './validation/types.ts';
import {NOT_SUPPORTED, type ValidatorOrUnsupported} from '../types.ts';

export interface FlatCase {
  key: string; // "GROUP.case"
  suite: 'validation' | 'format-validation' | 'realworld';
  group: string;
  name: string;
  samples: {valid: unknown[]; invalid: unknown[]};
  tsValidate: ValidatorOrUnsupported;
  /** Set when the ts-go-run-types `validate` thunk THREW while building the
   *  validator (e.g. the plugin didn't rewrite the call site). Distinct from
   *  `NOT_SUPPORTED`: a throw is a hard error the runner must surface, not a
   *  documented opt-out. Only ts-go-run-types populates this — it is the system
   *  under test. */
  tsError?: string;
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
      let tsError: string | undefined;
      // factoryThrows cases render an alwaysThrow factory: unsupported at root.
      if (!def.factoryThrows && def.validate !== NOT_SUPPORTED) {
        try {
          tsValidate = (def.validate as () => (v: unknown) => boolean)();
        } catch (err) {
          // The plugin SHOULD have rewritten this call site. A throw here means
          // it did not (plugin inactive / marker .d.ts unresolved) or the
          // factory regressed — record it so the runner fails LOUDLY rather than
          // silently counting the case "not supported" (which hid a fully broken
          // build behind not-supported=N + exit 0).
          tsError = err instanceof Error ? err.message : String(err);
        }
      }

      out.push({key: `${group}.${name}`, suite: suiteName, group, name, samples, tsValidate, tsError});
    }
  }
  return out;
}

export const VALIDATION_CASES = flatten(VALIDATION_SUITE as unknown as SuiteShape, 'validation');
export const FORMAT_CASES = flatten(FORMAT_VALIDATION_SUITE as unknown as SuiteShape, 'format-validation');
export const REALWORLD_CASES = flatten({REALWORLD} as unknown as SuiteShape, 'realworld');
export const ALL_CASES = [...VALIDATION_CASES, ...FORMAT_CASES, ...REALWORLD_CASES];
