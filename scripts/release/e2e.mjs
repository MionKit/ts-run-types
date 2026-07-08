#!/usr/bin/env node
// The single front door for the pre-publish e2e (docs/todos/prepublish-e2e-1-harness.md).
// Local and every CI lane call the SAME script, so they cannot drift:
//
//   build -> registry -> install the PUBLISHED @ts-runtypes/* -> run the consumer suite
//
// Two registry backends:
//   container (default; required locally) - the shared image runs verdaccio in a
//     rootless container (its untrusted dep tree never touches the host), publishes
//     the mounted tarballs, and the multi-bundler FEATURE MATRIX builds + tests
//     INSIDE the container against that in-container verdaccio. A lean HOST-NATIVE
//     smoke then installs from the port-published :4873 and runs vitest, exercising
//     THIS host's platform binary (the one thing no container can substitute).
//   host-npx (CI macOS/Windows only; GUARDED by CI) - GitHub's mac/win runners
//     can't run a Linux container, so they fall back to on-runner `npx verdaccio`
//     and run the host-native smoke only. Refused on a dev machine (container-or-error).
//
// Flags: --backend <container|host-npx>  --port <n>  --pack (rebuild tarballs)
//        --no-matrix  --no-host-smoke
import {execFileSync, spawn} from 'node:child_process';
import {existsSync, readFileSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {requireEngine} from '../lib/engine.mjs';
import {startRegistry, stopRegistry} from '../container/image.mjs';
import {capture, die, note, noteErr, reportCliError, run, runOrThrow, sleep, which} from '../lib/proc.mjs';

const E2E_DIR = join(REPO_ROOT, 'container/pre-publish-e2e');
const HOST_SMOKE_DIR = join(E2E_DIR, 'host-smoke');
const TARBALLS = join(REPO_ROOT, 'tarballs');

function readVersion() {
  return JSON.parse(readFileSync(join(REPO_ROOT, 'version.json'), 'utf8')).version;
}

// Ensure tarballs/ holds the packed packages (mirror the gate's build job). Build
// them when missing or when --pack forces a rebuild.
function ensureTarballs(force) {
  const have = existsSync(TARBALLS) && readdirSync(TARBALLS).some((file) => file.endsWith('.tgz'));
  if (have && !force) return;
  note(have ? 'rebuilding tarballs (--pack)' : 'tarballs/ missing - building packages + binaries + packing');
  runOrThrow('pnpm', ['-r', 'run', 'build'], {failMessage: 'e2e: FE dist build failed'});
  runOrThrow('node', ['scripts/release/build-binaries.mjs'], {failMessage: 'e2e: binary build failed'});
  runOrThrow('node', ['scripts/release/pack.mjs'], {failMessage: 'e2e: pack failed'});
}

// Poll the container healthcheck until the registry has published every tarball.
async function waitHealthy(engine, container, timeoutS = 240) {
  const deadline = Date.now() + timeoutS * 1000;
  while (Date.now() < deadline) {
    const status = capture(engine, ['inspect', '--format', '{{.State.Health.Status}}', container]).stdout.trim();
    if (status === 'healthy') return;
    if (status === 'unhealthy') break;
    await sleep(1500);
  }
  noteErr('registry did not become healthy - last 60 log lines:');
  run(engine, ['logs', '--tail', '60', container], {stdio: ['inherit', 'inherit', 'inherit']});
  die('e2e: containerized verdaccio failed to publish the tarballs in time');
}

// The in-container feature matrix: copy the bind-mounted source into /e2e (on top
// of the baked toolchains), install the published @ts-runtypes/* from the
// in-container verdaccio, build every bundler app, then assert over the output.
const MATRIX_SCRIPT = `set -eu
cd /e2e
cp -a /e2e-src/apps /e2e-src/test /e2e-src/build-all.mjs /e2e-src/lint-all.mjs /e2e-src/tsconfig.base.json /e2e/
rm -rf /e2e/apps/*/dist /e2e/apps/*/.rt /e2e/apps/shared/.rt
echo "e2e-matrix: installing @ts-runtypes/core@$RT_E2E_VERSION + devtools from the in-container verdaccio"
# Install with npm (like a real consumer + the host smoke): additive onto the
# baked pnpm-hoisted toolchains, and store-agnostic (pnpm's build-time store lives
# in a cache mount that isn't in the image, so a runtime 'pnpm add' would re-resolve
# + prune the toolchains). npm has no minimumReleaseAge gate, so the packages under
# test install exactly what their published manifests pin.
# --legacy-peer-deps mirrors the baked tree's non-strict posture (the toolchains
# cross-declare loose peers, e.g. rolldown-vite wants esbuild ^0.27 while the pinned
# esbuild is 0.28) so npm layers @ts-runtypes/* on without re-litigating them. That
# also skips peer auto-install, so @ts-runtypes/bin (devtools' launcher peer, which
# pulls the matching @ts-runtypes/binary-<os>-<arch> via its optional deps) is
# installed explicitly - exactly the resolution chain the e2e exists to prove.
npm install "@ts-runtypes/core@$RT_E2E_VERSION" "@ts-runtypes/devtools@$RT_E2E_VERSION" "@ts-runtypes/bin@$RT_E2E_VERSION" --registry http://127.0.0.1:4873 --no-audit --no-fund --legacy-peer-deps
echo "e2e-matrix: building every bundler app"
node build-all.mjs
echo "e2e-matrix: asserting over the build output (runtime + rewrite evidence + lint transport)"
node --test test/*.test.mjs`;

function runContainerMatrix(engine, container, version) {
  note('running the multi-bundler feature matrix inside the container');
  const code = run(engine, ['exec', '-e', `RT_E2E_VERSION=${version}`, container, 'sh', '-c', MATRIX_SCRIPT], {stdio: ['inherit', 'inherit', 'inherit']});
  if (code !== 0) die('e2e: the in-container feature matrix failed', code);
}

// The host-native lean smoke: install the published packages from the
// port-published verdaccio and run vitest, which transforms main.ts through the
// RunTypes Vite plugin -> resolves + spawns THIS host's platform binary.
function runHostSmoke(version, port) {
  note(`running the host-native lean smoke (exercises this host's platform binary) against :${port}`);
  const registry = `http://127.0.0.1:${port}`;
  const env = {...process.env, npm_config_registry: registry};
  // npm install of the two packages also pulls the fixture's pinned vite/vitest
  // (proxied through verdaccio), exactly like a real consumer install.
  runOrThrow('npm', ['install', `@ts-runtypes/core@${version}`, `@ts-runtypes/devtools@${version}`, '--registry', registry, '--no-save', '--no-package-lock'], {cwd: HOST_SMOKE_DIR, env, failMessage: 'e2e: host-smoke install failed'});
  const code = run('npm', ['test'], {cwd: HOST_SMOKE_DIR, env});
  if (code !== 0) die('e2e: the host-native smoke failed', code);
}

// Poll a verdaccio ping endpoint until it answers (or times out).
async function waitPing(registry, timeoutS = 90) {
  const deadline = Date.now() + timeoutS * 1000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${registry}/-/ping`);
      if (res.ok) return;
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  die('e2e: on-runner verdaccio did not become ready');
}

// ── host-npx backend (CI macOS/Windows only) ─────────────────────────────────
// GitHub's mac/win runners can't run a Linux container (L2), so verdaccio runs on
// the (ephemeral, disposable) runner via npx. Cross-platform: verdaccio is spawned
// as a detached node child (no shell backgrounding), readiness is polled with
// fetch. Refused off-CI by the guard - the supply-chain point of the design.
async function runHostNpxBackend(version, port, opts) {
  if (!process.env.CI) {
    die(
      'e2e: the host-npx backend is CI-only (it runs verdaccio + its dependency tree on the HOST). ' +
        'On a dev machine use the default container backend - start podman (see the ts-runtypes-setup skill) and re-run.'
    );
  }
  noteErr('e2e: CI host-npx fallback - running verdaccio on the runner (ephemeral VM, not a dev host)');
  const registry = `http://127.0.0.1:${port}`;
  const onWindows = process.platform === 'win32';
  const verdaccio = spawn('npx', ['--yes', 'verdaccio@6.7.2', '--config', '.github/verdaccio.yaml', '--listen', `0.0.0.0:${port}`], {
    cwd: REPO_ROOT,
    stdio: 'ignore',
    detached: !onWindows,
    shell: onWindows,
  });
  verdaccio.unref();
  const killVerdaccio = () => {
    try {
      if (!onWindows && verdaccio.pid) process.kill(-verdaccio.pid);
      else verdaccio.kill();
    } catch {
      // already gone
    }
  };
  try {
    await waitPing(registry);
    execFileSync('npm', ['config', 'set', `//127.0.0.1:${port}/:_authToken`, 'e2e-local-verdaccio'], {stdio: 'inherit'});
    execFileSync('node', ['scripts/release/publish-tarballs.mjs', '--registry', registry], {cwd: REPO_ROOT, stdio: 'inherit'});
    // The bundler matrix does NOT repeat per-OS (it's OS-agnostic; the ubuntu
    // container lane covers it) - the mac/win lanes are the per-OS binary axis only.
    if (opts.hostSmoke) runHostSmoke(version, port);
    noteErr('e2e: host-npx backend covered the per-OS binary smoke (the bundler matrix runs on the Linux container lane)');
  } finally {
    killVerdaccio();
  }
}

// ── container backend (default; local + Linux CI) ────────────────────────────
async function runContainerBackend(version, port, opts) {
  const {engine, container} = startRegistry({tarballsDir: TARBALLS, e2eSrcDir: E2E_DIR, port});
  let stopped = false;
  const teardown = () => {
    if (stopped) return;
    stopped = true;
    stopRegistry(engine, container);
  };
  process.on('exit', teardown);
  process.on('SIGINT', () => (teardown(), process.exit(130)));
  process.on('SIGTERM', () => (teardown(), process.exit(143)));
  try {
    await waitHealthy(engine, container);
    note(`containerized verdaccio is healthy on 127.0.0.1:${port}`);
    if (opts.matrix) runContainerMatrix(engine, container, version);
    if (opts.hostSmoke) runHostSmoke(version, port);
  } finally {
    teardown();
  }
}

function parseArgs(argv) {
  const opts = {backend: 'container', port: '4873', pack: false, matrix: true, hostSmoke: true};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--backend') opts.backend = argv[++i];
    else if (arg === '--port') opts.port = argv[++i];
    else if (arg === '--pack') opts.pack = true;
    else if (arg === '--no-matrix') opts.matrix = false;
    else if (arg === '--no-host-smoke') opts.hostSmoke = false;
    else die(`e2e: unknown flag '${arg}'. Usage: rtx release e2e [--backend container|host-npx] [--port N] [--pack] [--no-matrix] [--no-host-smoke]`);
  }
  if (opts.backend !== 'container' && opts.backend !== 'host-npx') die(`e2e: unknown backend '${opts.backend}' (expected container | host-npx)`);
  return opts;
}

async function main(argv) {
  const opts = parseArgs(argv);
  const version = readVersion();
  note(`pre-publish e2e for @ts-runtypes/* @ ${version} (backend: ${opts.backend})`);
  ensureTarballs(opts.pack);
  if (opts.backend === 'host-npx') return runHostNpxBackend(version, opts.port, opts);
  // container backend: podman must be reachable (fail clearly if not).
  const engine = process.env.RT_WEBSITE_ENGINE || 'podman';
  if (!which(engine)) die(`e2e: container engine '${engine}' not found. Install podman (see the ts-runtypes-setup skill), or on a CI mac/win runner pass --backend host-npx.`);
  requireEngine(engine);
  await runContainerBackend(version, opts.port, opts);
  note('pre-publish e2e: PASS');
}

loadEnv();
try {
  await main(process.argv.slice(2));
} catch (err) {
  reportCliError(err);
}
