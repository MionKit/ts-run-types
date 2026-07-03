// Integration suite for the lint plugin: real fixture projects on disk, the
// real bin/ts-runtypes behind the session bridge, and the rules driven the
// way a lint host drives them (create → Program visitor → reports).
//
// Marker coverage rule (CLAUDE.md): the Family A fixtures cover BOTH
// getRunTypeId call shapes — static `getRunTypeId<T>()` and reflection
// `getRunTypeId(value)` — including the hash-equivalence assertion via the
// sibling ResolverClient.

import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import plugin, {meta, rules} from '../../src/eslint/index.ts';
import {resetSharedSession} from '../../src/eslint/session.ts';
import {ResolverClient} from '../../src/resolver-client.ts';
import {TODO_LINE, TODO_TAG} from '../../src/runtypes-constants.generated.ts';
import {BIN, hasBinary, makeFixtureProject, runRule, type FixtureProject, type LintReportedProblem} from './fixture.ts';

const FORMS_TS = `import {getRunTypeId} from 'ts-runtypes';

export const staticId = getRunTypeId<string>();
const s: string = 'hello';
export const reflectId = getRunTypeId(s);
`;

const BAD_FORM_TS = `import {getRunTypeId} from 'ts-runtypes';

function load(): {name: string} {
  return {name: 'x'};
}
export const id = getRunTypeId(load());
`;

const GENERIC_MARKER_TS = `import {createValidate} from 'ts-runtypes';

export function makeValidator<T>() {
  return createValidate<T>();
}
`;

const WIDGET_TS = `import {createValidate} from 'ts-runtypes';

interface Widget {
  label: string;
  onClick: () => void;
}

export const isWidget = createValidate<Widget>();
`;

const USER_TS = `export interface User {
  name: string;
  age: number;
}
`;

const MIRROR_DIRTY_TS = `import type { User } from './user';
import type { FriendlyType, MockData } from 'ts-runtypes';

/** @rtType User#u1 @rtIds {age: a1, name: n1} */
${TODO_LINE}
export const friendlyUser: FriendlyType<User> = {
  name: {rt$label: 'Name'},
  nope: {rt$label: 'Gone'},
};

/** @rtType User#u1 */
export const mockUser: MockData<User> = {
  age: {min: 1, max: 9},
  vanished: {pool: ['x']},
};

/* @rtOrphan export const friendlyGone = {}; */
export const keep = {/* @rtOrphanChild old: 1, */ fresh: 1};
`;

const MIRROR_CLEAN_TS = `import type { User } from './user';
import type { FriendlyType } from 'ts-runtypes';

/** @rtType User#u1 @rtIds {age: a1, name: n1} */
export const friendlyUser: FriendlyType<User> = {
  name: {rt$label: 'Name'},
  age: {rt$label: 'Age'},
};
`;

const MIRROR_DRIFT_TS = `import type { Ghost } from './ghost';
import type { FriendlyType } from 'ts-runtypes';

/** @rtType Ghost#g1 */
export const friendlyGhost: FriendlyType<{name: string}> = {
  name: {rt$label: 'Name'},
};
`;

const PLAIN_TS = `// ${TODO_TAG}: hand-written file, not enrichment
export const answer = 42;
`;

// locate returns the report-shaped (1-based line, 0-based column) position of
// needle in text, so expectations derive from the fixture instead of
// hand-counted numbers.
function locate(text: string, needle: string): {line: number; column: number} {
  const offset = text.indexOf(needle);
  if (offset < 0) throw new Error(`fixture is missing ${JSON.stringify(needle)}`);
  const before = text.slice(0, offset);
  const line = before.split('\n').length;
  const column = offset - (before.lastIndexOf('\n') + 1);
  return {line, column};
}

describe.runIf(hasBinary())(
  'lint plugin (integration through bin/ts-runtypes)',
  () => {
    let project: FixtureProject;
    let settings: Record<string, unknown>;
    const abs = new Map<string, string>();
    const texts: Record<string, string> = {
      'forms.ts': FORMS_TS,
      'bad-form.ts': BAD_FORM_TS,
      'generic-marker.ts': GENERIC_MARKER_TS,
      'widget.ts': WIDGET_TS,
      'user.ts': USER_TS,
      'mirror-dirty.ts': MIRROR_DIRTY_TS,
      'mirror-clean.ts': MIRROR_CLEAN_TS,
      'mirror-drift.ts': MIRROR_DRIFT_TS,
      'plain.ts': PLAIN_TS,
    };

    beforeAll(() => {
      project = makeFixtureProject(texts);
      for (const rel of Object.keys(texts)) abs.set(rel, `${project.dir}/${rel}`);
      settings = {runtypes: {binary: BIN, cwd: project.dir}};
    });

    afterAll(() => {
      resetSharedSession();
      project.cleanup();
    });

    function reportsFor(ruleName: keyof typeof rules, rel: string): LintReportedProblem[] {
      return runRule(rules[ruleName], abs.get(rel)!, texts[rel]!, settings);
    }

    it('exposes the runtypes namespace and all seven rules', () => {
      expect(meta.name).toBe('runtypes');
      expect(Object.keys(rules).sort()).toEqual(
        ['enrichment-drift', 'enrichment-field', 'error', 'info', 'no-enrichment-todo', 'no-orphan-carcass', 'warn'].sort()
      );
      expect(plugin.configs['recommended']).toBeDefined();
    });

    describe('Family A — compiler diagnostics through the severity tiers', () => {
      it('reports nothing on a clean file using BOTH getRunTypeId shapes', () => {
        for (const ruleName of ['error', 'warn', 'info'] as const) {
          expect(reportsFor(ruleName, 'forms.ts')).toEqual([]);
        }
      });

      it('static and reflection getRunTypeId forms resolve to the SAME cache id (hash equivalence)', async () => {
        const client = new ResolverClient(BIN, project.dir, '', {serverMode: true, singleThreaded: true});
        try {
          await client.setSources({'forms.ts': FORMS_TS});
          const result = await client.scanFiles(['forms.ts']);
          expect(result.sites).toHaveLength(2);
          expect(result.sites[0]!.id).toBe(result.sites[1]!.id);
        } finally {
          client.close();
        }
      });

      it('routes a Warning-severity diagnostic (MKR001, reflection form invoking a function) to runtypes/warn', () => {
        const reports = reportsFor('warn', 'bad-form.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[MKR001]');
        expect(reports[0]!.message).toContain('load');
        expect(reports[0]!.line).toBe(locate(BAD_FORM_TS, 'getRunTypeId(load())').line);
        expect(reportsFor('error', 'bad-form.ts')).toEqual([]);
      });

      it('routes an Error-severity diagnostic (MKR003, marker in a generic function) to runtypes/error', () => {
        const reports = reportsFor('error', 'generic-marker.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[MKR003]');
        expect(reports[0]!.line).toBe(locate(GENERIC_MARKER_TS, 'createValidate<T>()').line);
        expect(reportsFor('warn', 'generic-marker.ts')).toEqual([]);
      });

      it('surfaces RunType render diagnostics (VL011 method drop) without entry modules on the wire', () => {
        const reports = reportsFor('warn', 'widget.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[VL011]');
        expect(reports[0]!.message).toContain('onClick');
        expect(reports[0]!.line).toBe(locate(WIDGET_TS, 'createValidate<Widget>()').line);
      });
    });

    describe('enrichment rules — one pass, per-concern routing', () => {
      it('no-enrichment-todo fires once on the scaffold line with a tight tag span', () => {
        const reports = reportsFor('no-enrichment-todo', 'mirror-dirty.ts');
        expect(reports).toHaveLength(1);
        const expected = locate(MIRROR_DIRTY_TS, TODO_TAG);
        expect(reports[0]).toMatchObject({line: expected.line, column: expected.column});
        expect(reports[0]!.endColumn).toBe(expected.column + TODO_TAG.length);
        expect(reports[0]!.message).toContain('[ENR001]');
      });

      it('no-orphan-carcass fires on both carcass forms', () => {
        const reports = reportsFor('no-orphan-carcass', 'mirror-dirty.ts');
        expect(reports).toHaveLength(2);
        expect(reports[0]!.message).toContain('[ENR002]');
        expect(reports[0]!.line).toBe(locate(MIRROR_DIRTY_TS, '@rtOrphan export').line);
        expect(reports[1]!.message).toContain('[ENR003]');
        expect(reports[1]!.line).toBe(locate(MIRROR_DIRTY_TS, '@rtOrphanChild old').line);
      });

      it('enrichment-field anchors FT002/MD001 on the dead keys', () => {
        const reports = reportsFor('enrichment-field', 'mirror-dirty.ts');
        expect(reports).toHaveLength(2);
        const ft002 = reports.find((report) => report.message.includes('[FT002]'))!;
        expect(ft002.message).toContain('`nope`');
        expect(ft002).toMatchObject(locate(MIRROR_DIRTY_TS, 'nope:'));
        const md001 = reports.find((report) => report.message.includes('[MD001]'))!;
        expect(md001.message).toContain('`vanished`');
        expect(md001).toMatchObject(locate(MIRROR_DIRTY_TS, 'vanished:'));
      });

      it('enrichment-drift reports GE002 on a dead breadcrumb, anchored to the import', () => {
        const reports = reportsFor('enrichment-drift', 'mirror-drift.ts');
        expect(reports).toHaveLength(1);
        expect(reports[0]!.message).toContain('[GE002]');
        expect(reports[0]!.message).toContain('./ghost');
        expect(reports[0]!.line).toBe(1);
      });

      it('a clean mirror (markers + @rtIds + valid content) produces ZERO reports on every rule', () => {
        for (const ruleName of Object.keys(rules) as (keyof typeof rules)[]) {
          expect(reportsFor(ruleName, 'mirror-clean.ts')).toEqual([]);
        }
      });

      it('replays from the session cache: a second identical pass returns the same reports', () => {
        const first = reportsFor('no-enrichment-todo', 'mirror-dirty.ts');
        const second = reportsFor('no-enrichment-todo', 'mirror-dirty.ts');
        expect(second).toEqual(first);
      });
    });

    describe('scoping', () => {
      it('a hand-written file with a stray @todo comment never reaches the resolver (empty visitor)', () => {
        for (const ruleName of Object.keys(rules) as (keyof typeof rules)[]) {
          const visitor = rules[ruleName].create({
            physicalFilename: abs.get('plain.ts')!,
            filename: abs.get('plain.ts')!,
            sourceCode: {text: PLAIN_TS},
            settings,
            report: () => {
              throw new Error('must not report');
            },
          } as never);
          expect(Object.keys(visitor)).toEqual([]);
        }
      });

      it('unnamed virtual buffers are skipped', () => {
        const visitor = rules['no-enrichment-todo'].create({
          physicalFilename: '<input>',
          filename: '<input>',
          sourceCode: {text: MIRROR_DIRTY_TS},
          settings,
          report: () => {
            throw new Error('must not report');
          },
        } as never);
        expect(Object.keys(visitor)).toEqual([]);
      });
    });
  },
  120_000
);
