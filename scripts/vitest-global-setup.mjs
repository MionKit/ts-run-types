import {spawn, spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createConnection} from 'node:net';
import {dirname, resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {existsSync, unlinkSync} from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const CHECK_SCRIPT = resolve(HERE, 'check-go-binary.sh');
const BIN = resolve(ROOT, 'bin/ts-go-run-types');

// Vitest globalSetup runs once per vitest invocation. We use it for two
// things:
//
//   1. Verify the Go binary is built and matches the current source. Fail
//      fast with a helpful message if not.
//   2. Spawn the binary as a long-lived daemon over a Unix socket, expose
//      its path via TS_GO_RUN_TYPES_SOCKET, and return a teardown that
//      kills the daemon when the run ends.
//
// Test files connect to this daemon via ResolverSocketClient. The daemon
// stays Program-less until the first setSources op; each test sends its own
// setSources to install its fixtures, scans, then moves on. The structural
// type cache survives across calls so dedup IDs stay stable.

export default async function setup() {
  const check = spawnSync('bash', [CHECK_SCRIPT], {stdio: 'inherit'});
  if (check.status !== 0) {
    throw new Error(
      'bin/ts-go-run-types is missing or out of sync with Go source — see message above. Tests aborted.'
    );
  }

  // Socket path is unique per vitest pid so concurrent runs don't collide.
  const socketPath = resolve(tmpdir(), `ts-go-run-types-vitest-${process.pid}.sock`);
  if (existsSync(socketPath)) {
    try { unlinkSync(socketPath); } catch {}
  }

  // --daemon listens on the socket; --inline-server starts Program-less so
  // each connection can install its own sources. The binary echoes a
  // "listening on …" line to stderr when ready; we still poll the socket
  // to avoid racing the connection.
  const child = spawn(BIN, ['--daemon', '--inline-server', '--socket', socketPath, '--cwd', ROOT], {
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  child.on('error', (err) => {
    console.error(`[vitest-global-setup] daemon spawn error: ${err.message}`);
  });

  await waitForSocket(socketPath, 10_000);

  process.env.TS_GO_RUN_TYPES_SOCKET = socketPath;

  return async function teardown() {
    if (!child.killed) child.kill('SIGTERM');
    // Allow up to 2s for graceful exit; fall back to SIGKILL.
    await new Promise((res) => {
      const t = setTimeout(() => {
        try { child.kill('SIGKILL'); } catch {}
        res();
      }, 2_000);
      child.once('exit', () => { clearTimeout(t); res(); });
    });
    if (existsSync(socketPath)) {
      try { unlinkSync(socketPath); } catch {}
    }
  };
}

async function waitForSocket(socketPath, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastErr;
  while (Date.now() < deadline) {
    if (existsSync(socketPath)) {
      // The file exists but the listener may not yet be accept()ing — probe
      // with a connect, retry on ECONNREFUSED.
      const ok = await new Promise((res) => {
        const s = createConnection(socketPath);
        s.once('connect', () => { s.end(); res(true); });
        s.once('error', () => res(false));
      });
      if (ok) return;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(
    `ts-go-run-types daemon did not start within ${timeoutMs}ms at ${socketPath}${lastErr ? `: ${lastErr.message}` : ''}`
  );
}
