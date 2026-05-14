import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK_SCRIPT = resolve(HERE, 'check-go-binary.sh');

// Vitest globalSetup. Single responsibility: make sure the Go binary
// matches the current source tree before any tests run, rebuilding it
// in place if missing or stale. The per-file resolver daemon is spawned
// lazily by packages/vite-plugin-runtypes/test/helpers/inline.ts (one
// ts-go-run-types process per test file, killed on afterAll) — keeps
// each file's overlay / cache isolated from siblings so parallel-file
// execution is safe.
export default function setup() {
  const result = spawnSync('bash', [CHECK_SCRIPT], {stdio: 'inherit'});
  if (result.status !== 0) {
    throw new Error(
      'Failed to build bin/ts-go-run-types — see message above. Tests aborted.'
    );
  }
}
