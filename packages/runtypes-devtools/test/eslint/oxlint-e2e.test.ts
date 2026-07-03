// End-to-end proof of the OXlint target: the REAL oxlint CLI loads the built
// plugin via jsPlugins, lints a dirty fixture project, and the findings come
// back under the runtypes/<rule> ids with error exit semantics. This is the
// commit-gate wiring (.oxlintrc.json + lint-staged) exercised for real —
// including the load-time resolver pre-spawn that survives oxlint's
// multi-threaded memory ramp.

import {execFile} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {promisify} from 'node:util';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {TODO_LINE} from '../../src/runtypes-constants.generated.ts';
import {BIN, hasBinary, makeFixtureProject, type FixtureProject} from './fixture.ts';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(__dirname, '../../../..');
const OXLINT = path.resolve(ROOT, 'node_modules/.bin/oxlint');
const PLUGIN_DIST = path.resolve(__dirname, '../../dist/eslint/index.js');

const ready = hasBinary() && fs.existsSync(OXLINT) && fs.existsSync(PLUGIN_DIST);

describe.runIf(ready)('oxlint end to end (jsPlugins)', () => {
  let project: FixtureProject;

  beforeAll(() => {
    project = makeFixtureProject({
      'user.ts': 'export interface User {\n  name: string;\n}\n',
      'mirror.ts':
        "import type { User } from './user';\n" +
        "import type { FriendlyType } from 'ts-runtypes';\n\n" +
        '/** @rtType User#u1 @rtIds {name: n1} */\n' +
        `${TODO_LINE}\n` +
        'export const friendlyUser: FriendlyType<User> = {\n' +
        "  name: {rt$label: 'Name'},\n" +
        "  nope: {rt$label: 'Gone'},\n" +
        '};\n',
      'widget.ts':
        "import {createValidate} from 'ts-runtypes';\n\n" +
        'interface Widget {\n  label: string;\n  onClick: () => void;\n}\n\n' +
        'export const isWidget = createValidate<Widget>();\n',
    });
    project.write(
      '.oxlintrc.json',
      JSON.stringify(
        {
          categories: {correctness: 'off'},
          jsPlugins: [PLUGIN_DIST],
          settings: {runtypes: {binary: BIN, cwd: project.dir}},
          rules: {
            'runtypes/error': 'error',
            'runtypes/warn': 'warn',
            'runtypes/info': 'off',
            'runtypes/no-enrichment-todo': 'error',
            'runtypes/no-orphan-carcass': 'error',
            'runtypes/enrichment-field': 'error',
            'runtypes/enrichment-drift': 'error',
          },
          ignorePatterns: ['node_modules/**'],
        },
        null,
        2
      )
    );
  });

  afterAll(() => {
    project.cleanup();
  });

  it('reports every family under runtypes/<rule> ids and fails the run on errors', {timeout: 120_000}, async () => {
    let stdout = '';
    let exitCode = 0;
    try {
      const result = await execFileAsync(OXLINT, ['-c', '.oxlintrc.json', '.'], {cwd: project.dir});
      stdout = result.stdout;
    } catch (error) {
      const failed = error as {stdout?: string; code?: number};
      stdout = failed.stdout ?? '';
      exitCode = failed.code ?? 1;
    }

    // Error-severity findings must fail the commit gate.
    expect(exitCode).toBe(1);
    expect(stdout).toContain('runtypes(no-enrichment-todo)');
    expect(stdout).toContain('[ENR001]');
    expect(stdout).toContain('runtypes(enrichment-field)');
    expect(stdout).toContain('[FT002]');
    // Family A rides the same run: the VL011 warning from the widget file.
    expect(stdout).toContain('runtypes(warn)');
    expect(stdout).toContain('[VL011]');
    // The engine itself must not have failed.
    expect(stdout).not.toContain('resolver failed');
    expect(stdout).not.toContain('resolver unavailable');
  });
});
