import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {dirname, resolve} from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const CHECK_SCRIPT = resolve(HERE, 'check-go-binary.sh');

// Vitest globalSetup. Single responsibility: make sure the Go binary
// matches the current Go source tree (check-go-binary.sh rebuilds if
// missing/stale).
//
// The other test-time invariant — vite-plugin-runtypes/dist must
// exist so workspace consumers (currently @mionjs/ts-go-run-types) can
// import it as a normal devDep — is handled by the `pretest` script
// in the relevant package.json instead of here. That ordering matters:
// vitest.config.ts imports the plugin AT CONFIG-LOAD time (the import
// runs in esbuild before vitest reads the config object), so the
// build has to happen before vitest is even invoked. globalSetup runs
// AFTER config load and would be too late.
//
// The per-file resolver daemon is spawned lazily by
// packages/vite-plugin-runtypes/test/helpers/inline.ts (one
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
