// Single source of truth for the shared cases: the `CaseKey` union (drives
// per-competitor totality) + `iterateCases()` (drives the runner).
//
// TEMPORARY BRIDGE: today this re-projects the existing `src/suites/*` onto the
// slim `SharedCase` shape (a `ValidationCase`/`FormatValidationCase` is
// structurally assignable to `SharedCase` — it already carries getSamples +
// title + factoryThrows). This lets the new harness + competitors be built and
// validated BEFORE the suite files are physically moved here and slimmed. The
// migration step replaces the three imports below with `./validation`,
// `./format-validation`, `./realworld` and drops `src/suites/`.

import {VALIDATION_SUITE} from '../../src/suites/validation/index.ts';
import {FORMAT_VALIDATION_SUITE} from '../../src/suites/format-validation/index.ts';
import {REALWORLD} from '../../src/suites/realworld/index.ts';
import type {SharedCase} from './types.ts';

export type SuiteName = 'validation' | 'format-validation' | 'realworld';

// `${GROUP}.${case}` over every group in a suite object (`{ATOMIC: {...}, ...}`).
type GroupKeys<S> = {[G in keyof S]: `${G & string}.${keyof S[G] & string}`}[keyof S];

export type CaseKey =
  | GroupKeys<typeof VALIDATION_SUITE>
  | GroupKeys<typeof FORMAT_VALIDATION_SUITE>
  | `REALWORLD.${keyof typeof REALWORLD & string}`;

export interface IteratedCase {
  key: CaseKey;
  suite: SuiteName;
  group: string;
  name: string;
  case: SharedCase;
}

type Groups = Record<string, Record<string, SharedCase>>;

function collect(suite: SuiteName, groups: Groups, out: IteratedCase[]): void {
  for (const [group, cases] of Object.entries(groups)) {
    for (const [name, sharedCase] of Object.entries(cases)) {
      out.push({key: `${group}.${name}` as CaseKey, suite, group, name, case: sharedCase});
    }
  }
}

const ALL: IteratedCase[] = [];
collect('validation', VALIDATION_SUITE as unknown as Groups, ALL);
collect('format-validation', FORMAT_VALIDATION_SUITE as unknown as Groups, ALL);
collect('realworld', {REALWORLD} as unknown as Groups, ALL);

export function iterateCases(): readonly IteratedCase[] {
  return ALL;
}
