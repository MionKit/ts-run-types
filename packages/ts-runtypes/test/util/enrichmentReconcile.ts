// Reconcile lane for the AI-enrichment suite: drives the `gen --update` /
// `gen --prune` CLI over a throwaway temp project (tsconfig + a source file +
// the enrich dir) and returns the resulting mirror-file text. Unlike the gen
// lane (which compares stdout skeletons), this exercises the FULL reconcile path
// on disk — property merge, rename, orphan, restore, prune — so the tests assert
// authored-value preservation + marker behaviour end-to-end. See
// docs/AI_ENRICHMENT.md → gen semantics.

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {mkdirSync, writeFileSync, readFileSync, rmSync, existsSync} from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../../../..');
const BIN = resolve(REPO_ROOT, 'bin/ts-runtypes');
const LANE_ROOT = resolve(HERE, '../suites/enrichment/.tmp/reconcile');

// A reconcile fixture is a self-contained temp project under a unique subdir of
// the reconcile lane. `dir` is the project root (holds tsconfig + src/);
// `sourcePath` is the source .ts; `mirrorPath` is its computed mirror file.
export interface ReconcileFixture {
  dir: string;
  sourcePath: string;
  mirrorPath: string;
}

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      rootDir: 'src',
      plugins: [{name: 'ts-runtypes', enrichDir: 'runtypes/generated'}],
    },
  },
  null,
  2
);

// makeFixture lays down a temp project with one source module at src/<name>.ts
// carrying `source`. The mirror path mirrors src/ under runtypes/generated/.
export function makeFixture(name: string, source: string): ReconcileFixture {
  const dir = resolve(LANE_ROOT, name);
  rmSync(dir, {recursive: true, force: true});
  mkdirSync(resolve(dir, 'src'), {recursive: true});
  writeFileSync(resolve(dir, 'tsconfig.json'), TSCONFIG);
  const sourcePath = resolve(dir, 'src', 'models.ts');
  writeFileSync(sourcePath, source);
  const mirrorPath = resolve(dir, 'runtypes', 'generated', 'models.ts');
  return {dir, sourcePath, mirrorPath};
}

// setSource rewrites the fixture's source module (simulating a type edit).
export function setSource(fixture: ReconcileFixture, source: string): void {
  writeFileSync(fixture.sourcePath, source);
}

// editMirror reads, transforms, and rewrites the mirror file — used to inject
// authored values before a reconcile.
export function editMirror(fixture: ReconcileFixture, transform: (text: string) => string): void {
  const text = readFileSync(fixture.mirrorPath, 'utf8');
  writeFileSync(fixture.mirrorPath, transform(text));
}

// readMirror returns the mirror file's current text (throws if absent).
export function readMirror(fixture: ReconcileFixture): string {
  return readFileSync(fixture.mirrorPath, 'utf8');
}

// runGen runs `gen <source> <Type> [extraArgs…]` from the fixture's project
// root. Throws on a non-zero exit.
export function runGen(fixture: ReconcileFixture, typeName: string, extraArgs: string[] = []): void {
  const args = ['gen', 'src/models.ts', typeName, ...extraArgs];
  const result = spawnSync(BIN, args, {cwd: fixture.dir, encoding: 'utf8'});
  if (result.error) throw new Error(`gen failed to launch: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gen ${args.join(' ')} exited ${result.status}: ${result.stderr}\n${result.stdout}`);
}

// runPrune runs `gen --prune <mirrorPath>` from the fixture's project root.
export function runPrune(fixture: ReconcileFixture): void {
  const result = spawnSync(BIN, ['gen', '--prune', fixture.mirrorPath], {cwd: fixture.dir, encoding: 'utf8'});
  if (result.error) throw new Error(`prune failed to launch: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gen --prune exited ${result.status}: ${result.stderr}\n${result.stdout}`);
}

// cleanupReconcileLane removes the whole reconcile lane temp tree.
export function cleanupReconcileLane(): void {
  if (existsSync(LANE_ROOT)) rmSync(LANE_ROOT, {recursive: true, force: true});
}
