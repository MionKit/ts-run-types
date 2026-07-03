// Session bridge failure-path tests: a broken engine must surface as an
// engineError outcome (never a hang, never silence) and stick so later files
// don't re-pay the failure.

import {afterAll, describe, expect, it} from 'vitest';
import {LintSession} from '../../src/eslint/session.ts';
import {makeFixtureProject, type FixtureProject} from './fixture.ts';

describe('LintSession failure paths', () => {
  const projects: FixtureProject[] = [];

  afterAll(() => {
    for (const project of projects) project.cleanup();
  });

  it('reports an engine error for a nonexistent binary, quickly and stickily', {timeout: 30_000}, () => {
    const project = makeFixtureProject({'a.ts': 'export const a = 1;'});
    projects.push(project);
    const session = new LintSession();
    try {
      const options = {binary: `${project.dir}/no-such-binary`, cwd: project.dir, timeoutMs: 20_000};
      const first = session.lintFileSync(`${project.dir}/a.ts`, 'export const a = 1;', options);
      expect('engineError' in first).toBe(true);

      // Sticky: a different file answers instantly from the dead flag.
      const start = Date.now();
      const second = session.lintFileSync(`${project.dir}/b.ts`, 'export const b = 2;', options);
      expect('engineError' in second).toBe(true);
      expect(Date.now() - start).toBeLessThan(250);
    } finally {
      session.dispose();
    }
  });
});
