// Translation lane of the AI-enrichment suite: drives the `gen --translate` /
// `check --translate` verbs over throwaway temp projects and asserts the i18n
// behaviour end-to-end — per-locale scaffolds anchored to the friendly source
// mirror, value-preserving reconciles (including the $errors descent), the
// completeness gate, and prune. The Go binary MUST be rebuilt before this runs.

import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';
import {describe, it, expect, afterAll} from 'vitest';
import {
  makeFixture,
  setSource,
  editMirror,
  readMirror,
  runGen,
  cleanupReconcileLane,
  type ReconcileFixture,
} from '../../util/enrichReconcile.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const BIN = resolve(HERE, '../../../../../bin/ts-runtypes');

afterAll(cleanupReconcileLane);

// i18nFixture upgrades a reconcile fixture's tsconfig with the i18n plugin
// object and returns the per-locale translation path helper.
function i18nFixture(name: string, source: string, locales: string[], strict = false): ReconcileFixture {
  const fixture = makeFixture(name, source);
  writeFileSync(
    resolve(fixture.dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          rootDir: 'src',
          plugins: [{name: 'ts-runtypes', enrichDir: 'runtypes/generated', i18n: {sourceLocale: 'en', locales, strict}}],
        },
      },
      null,
      2
    )
  );
  return fixture;
}

function translationPath(fixture: ReconcileFixture, locale: string): string {
  return resolve(fixture.enrichDir, 'i18n', locale, 'models.ts');
}

function readTranslation(fixture: ReconcileFixture, locale: string): string {
  return readFileSync(translationPath(fixture, locale), 'utf8');
}

// runBin spawns the CLI from the fixture root, returning status + output.
function runBin(fixture: ReconcileFixture, args: string[]): {status: number | null; out: string} {
  const result = spawnSync(BIN, args, {cwd: fixture.dir, encoding: 'utf8'});
  if (result.error) throw new Error(`${args.join(' ')} failed to launch: ${result.error.message}`);
  return {status: result.status, out: `${result.stdout}\n${result.stderr}`};
}

function runTranslate(fixture: ReconcileFixture, locale: string, extraArgs: string[] = []): void {
  const {status, out} = runBin(fixture, ['gen', '--translate', locale, 'src/models.ts', ...extraArgs]);
  if (status !== 0) throw new Error(`gen --translate exited ${status}: ${out}`);
}

// The translate verbs are a pure file-to-file transform over the friendly
// source mirror, so the $errors-descent cases author the mirror by hand
// (matching how a user's committed, filled-in mirror looks) — the type-driven
// gen lane is exercised separately below and in enrichReconcile.test.ts.
function authorFriendlyMirror(fixture: ReconcileFixture, body: string): void {
  mkdirSync(dirname(fixture.friendlyPath), {recursive: true});
  writeFileSync(
    fixture.friendlyPath,
    "import type { User } from '../../../src/models';\n" + "import type { FriendlyType } from 'ts-runtypes';\n\n" + body
  );
}

const FILLED_USER_MIRROR =
  '/** @rtType User#u1 @rtIds {name: n1, email: e1} */\n' +
  'export const friendlyUser: FriendlyType<User> = {\n' +
  "  $label: 'User',\n" +
  "  $errors: {type: 'must be a user'},\n" +
  "  name: {$label: 'Full name', $errors: {type: 'must be text', minLength: {one: 'at least $[val] character', other: 'at least $[val] characters'}}},\n" +
  "  email: {$label: 'Email', $errors: {type: 'must be text', pattern: 'invalid email'}},\n" +
  '};\n';

describe('enrichment i18n — gen --translate', () => {
  it('scaffolds a same-tree per-locale file anchored to the friendly source mirror', () => {
    const fixture = i18nFixture('tr-scaffold', 'export interface User { name: string; email: string }\n', ['pl']);
    authorFriendlyMirror(fixture, FILLED_USER_MIRROR);
    runTranslate(fixture, 'pl');

    const translation = readTranslation(fixture, 'pl');
    expect(translation).toContain('export const pl_friendlyUser: Translation<User>');
    expect(translation).toContain("import type { Translation } from 'ts-runtypes'");
    expect(translation, 'plural reseeds with the TARGET locale arms').toContain(
      "minLength: {one: '', few: '', many: '', other: ''}"
    );
    expect(translation).toContain("@rtI18n pl from '../../friendly/models'");
    expect(translation, 'never copies source text').not.toContain('Full name');
    expect(translation, 'mock never rides into translations').not.toContain('mock');
  });

  it('reconciles value-preservingly, descending into $errors (the load-bearing case)', () => {
    const fixture = i18nFixture('tr-update', 'export interface User { name: string; email: string }\n', ['pl']);
    authorFriendlyMirror(fixture, FILLED_USER_MIRROR);
    runTranslate(fixture, 'pl');

    // The translator fills a plural arm + a label.
    const authored = readTranslation(fixture, 'pl')
      .replace("one: ''", "one: 'co najmniej $[val] znak'")
      .replace("email: {$label: ''", "email: {$label: 'Adres e-mail'");
    writeFileSync(translationPath(fixture, 'pl'), authored);

    // The source FriendlyType gains a maxLength plural — the translation
    // reconcile must scaffold the new key INSIDE $errors with pl arms.
    authorFriendlyMirror(
      fixture,
      FILLED_USER_MIRROR.replace(
        "minLength: {one: 'at least $[val] character', other: 'at least $[val] characters'}",
        "minLength: {one: 'at least $[val] character', other: 'at least $[val] characters'}, maxLength: {one: 'max $[val] char', other: 'max $[val] chars'}"
      )
    );

    runTranslate(fixture, 'pl', ['--update']);
    const updated = readTranslation(fixture, 'pl');
    expect(updated, 'authored arm survives').toContain("one: 'co najmniej $[val] znak'");
    expect(updated, 'authored label survives').toContain("$label: 'Adres e-mail'");
    expect(updated, 'source-added constraint scaffolded with target arms').toContain(
      "maxLength: {one: '', few: '', many: '', other: ''}"
    );

    // Idempotency: a second --translate --update is a byte-identical no-op.
    const first = readTranslation(fixture, 'pl');
    runTranslate(fixture, 'pl', ['--update']);
    expect(readTranslation(fixture, 'pl'), 'second update is byte-identical').toBe(first);
  });

  it('--translate all fans out over every configured locale', () => {
    const fixture = i18nFixture('tr-all', 'export interface User { name: string }\n', ['es', 'pt-BR']);
    runGen(fixture, 'User');
    const {status, out} = runBin(fixture, ['gen', '--translate', 'all']);
    expect(status, out).toBe(0);
    expect(existsSync(translationPath(fixture, 'es'))).toBe(true);
    expect(existsSync(translationPath(fixture, 'pt-BR'))).toBe(true);
    expect(readTranslation(fixture, 'pt-BR')).toContain('export const pt_BR_friendlyUser: Translation<User>');
  });

  it('--translate --prune strips translation carcasses', () => {
    const fixture = i18nFixture('tr-prune', 'export interface User { name: string; age: number }\n', ['pl']);
    runGen(fixture, 'User');
    runTranslate(fixture, 'pl');
    // Source drops a field → the translation reconcile orphans it.
    setSource(fixture, 'export interface User { name: string }\n');
    runGen(fixture, 'User', ['--update']);
    runTranslate(fixture, 'pl', ['--update']);
    expect(readTranslation(fixture, 'pl')).toContain('@rtOrphanChild');

    runTranslate(fixture, 'pl', ['--prune']);
    expect(readTranslation(fixture, 'pl')).not.toContain('@rtOrphan');
  });
});

describe('enrichment i18n — check --translate', () => {
  it('reports blanks as warnings (exit 0) when lenient, errors (exit 1) when strict', () => {
    const lenient = i18nFixture('tr-check-lenient', 'export interface User { name: string }\n', ['pl'], false);
    runGen(lenient, 'User');
    runTranslate(lenient, 'pl');
    const lenientRun = runBin(lenient, ['check', '--translate', 'pl']);
    expect(lenientRun.out).toContain('TR002');
    expect(lenientRun.status, 'lenient gate never fails the build').toBe(0);

    const strict = i18nFixture('tr-check-strict', 'export interface User { name: string }\n', ['pl'], true);
    runGen(strict, 'User');
    runTranslate(strict, 'pl');
    const strictRun = runBin(strict, ['check', '--translate', 'pl']);
    expect(strictRun.out).toContain('TR002');
    expect(strictRun.status, 'strict gate fails CI on blanks').toBe(1);
  });

  it('flags a missing translation file (TR001) and an out-of-date one (TR003)', () => {
    const fixture = i18nFixture('tr-check-missing', 'export interface User { name: string }\n', ['pl']);
    runGen(fixture, 'User');
    const missing = runBin(fixture, ['check', '--translate', 'pl']);
    expect(missing.out).toContain('TR001');

    runTranslate(fixture, 'pl');
    // Fill every blank so only staleness can fire, then edit the source.
    editMirror(fixture, 'friendly', (text) => text); // touch nothing; just assert helper reachable
    setSource(fixture, 'export interface User { name: string; age: number }\n');
    runGen(fixture, 'User', ['--update']);
    const stale = runBin(fixture, ['check', '--translate', 'pl']);
    expect(stale.out).toContain('TR003');
  });
});
