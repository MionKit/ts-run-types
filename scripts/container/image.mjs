// image.mjs — own the lifecycle of the SINGLE shared podman image
// (container/website/Containerfile). That one image bakes BOTH dependency trees in
// separate dirs with separate node_modules:
//   /app    the Nuxt/Docus website deps   (run by scripts/website/site.mjs)
//   /bench  the benchmark deps            (run by scripts/website/bench-data/bench.mjs)
// so CI can pull one image and build the whole site (benchmark data included).
//
// This module is the single image OWNER: build, ensure (pull-or-build), login,
// push, pull, clean, lock. site.mjs and bench.mjs both delegate image ops here.
// Port of the former scripts/container/image.sh; the lib.sh/ghcr.sh helpers it
// sourced now live in scripts/lib/engine.mjs.
//
// Env overrides (read fresh on every entry, so bench.mjs can map its RT_BENCH_*
// knobs onto RT_WEBSITE_* by passing an env override): RT_WEBSITE_ENGINE,
// RT_WEBSITE_IMAGE, RT_WEBSITE_BASE_IMAGE, RT_WEBSITE_PNPM_VERSION, RT_WEBSITE_USE_LOCAL,
// RT_WEBSITE_REMOTE_IMAGE, GHCR_* (see lib/engine.mjs), RT_WEBSITE_MOUNT_OPTS,
// RT_WEBSITE_BUILD_NETWORK, RT_WEBSITE_RUN_NETWORK, RT_WEBSITE_CA_CERT.

import {cpSync, copyFileSync, existsSync, globSync, mkdirSync, rmSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {ghcrConfig, ghcrLogin, ghcrPullRetag, ghcrPushMultiarch, ghcrTryPullRetag, imageExists, requireEngine} from '../lib/engine.mjs';
import {capture, die, hostGoArch, note, noteErr, reportCliError, runOrThrow} from '../lib/proc.mjs';

// Env-INDEPENDENT paths + names.
const WEBSITE_DIR = join(REPO_ROOT, 'container/website');
const CACERTS_DIR = join(WEBSITE_DIR, '.cacerts');
const DEPS_DIR = join(WEBSITE_DIR, '_deps');
// The merged image also bakes the benchmark deps (under /bench). Their manifests
// live in container/benchmarks/_deps (the source of truth); we stage a copy into the
// website build context (.bench-deps/, git-ignored) so the Containerfile can COPY them.
const BENCH_DEPS_SRC = join(REPO_ROOT, 'container/benchmarks/_deps');
const BENCH_DEPS_STAGE = join(WEBSITE_DIR, '.bench-deps');
// The pre-publish e2e bakes its builder toolchains (_deps) + verdaccio registry
// assets (registry/) into the same shared image. Both are staged into the website
// build context (git-ignored .e2e-*) so the one Containerfile can COPY them.
const E2E_DIR = join(REPO_ROOT, 'container/pre-publish-e2e');
const E2E_DEPS_SRC = join(E2E_DIR, '_deps');
const E2E_DEPS_STAGE = join(WEBSITE_DIR, '.e2e-deps');
const E2E_REGISTRY_SRC = join(E2E_DIR, 'registry');
const E2E_REGISTRY_STAGE = join(WEBSITE_DIR, '.e2e-registry');
const MANIFEST_NAME = 'tsrt-website-manifest';

// Resolve the env-dependent config fresh (so a caller that mutated the env — or
// passed an override map — always wins). Mirrors lib.sh + image.sh's var block.
function config(env = process.env) {
  const {registry, owner} = ghcrConfig();
  const containerBase = env.RT_WEBSITE_CONTAINER || 'tsrt-website';
  return {
    engine: env.RT_WEBSITE_ENGINE || 'podman',
    image: env.RT_WEBSITE_IMAGE || 'tsrt-website:dev',
    containerBase,
    mountOpts: env.RT_WEBSITE_MOUNT_OPTS || '',
    buildNetwork: env.RT_WEBSITE_BUILD_NETWORK || '',
    runNetwork: env.RT_WEBSITE_RUN_NETWORK || '',
    caSrc: env.RT_WEBSITE_CA_CERT || '',
    baseImage: env.RT_WEBSITE_BASE_IMAGE || '',
    pnpmVersion: env.RT_WEBSITE_PNPM_VERSION || '',
    useLocal: Boolean(env.RT_WEBSITE_USE_LOCAL),
    remoteImage: env.RT_WEBSITE_REMOTE_IMAGE || `${registry}/${owner}/tsrt-website:latest`,
    // Named volumes hold Nuxt's generated caches (run side); clean drops them.
    volNuxt: `${containerBase}-nuxt`,
    volData: `${containerBase}-data`,
    volCache: `${containerBase}-cache`,
  };
}

// Populate container/website/.cacerts/ from RT_WEBSITE_CA_CERT (file or dir). Always
// leaves the dir present (possibly empty) so the Containerfile COPY never fails.
function prepareCacerts(cfg) {
  rmSync(CACERTS_DIR, {recursive: true, force: true});
  mkdirSync(CACERTS_DIR, {recursive: true});
  // Behind a corporate / MITM egress proxy the image must trust the proxy CA. When
  // no explicit RT_WEBSITE_CA_CERT was given, fall back to the host's standard
  // custom-CA dir IF it holds certs (a no-op on a normal host / macOS).
  let caSrc = cfg.caSrc;
  const hostCaDir = '/usr/local/share/ca-certificates';
  if (!caSrc && existsSync(hostCaDir) && globSync('*.crt', {cwd: hostCaDir}).length > 0) {
    caSrc = hostCaDir;
    note(`auto-detected host CA certs in ${hostCaDir} (corporate/MITM proxy); trusting them in the image`);
  }
  if (caSrc) {
    if (existsSync(caSrc) && statSync(caSrc).isDirectory()) {
      for (const crt of globSync('*.crt', {cwd: caSrc})) copyFileSync(join(caSrc, crt), join(CACERTS_DIR, crt));
    } else if (existsSync(caSrc) && statSync(caSrc).isFile()) {
      copyFileSync(caSrc, join(CACERTS_DIR, 'extra-ca.crt'));
    } else {
      die(`image: RT_WEBSITE_CA_CERT='${caSrc}' is neither a file nor a directory`);
    }
    note(`trusting extra CA certs from ${caSrc}`);
  }
  writeFileSync(join(CACERTS_DIR, '.gitkeep'), '');
}

// Stage container/benchmarks/_deps into the website build context as .bench-deps/ so
// the merged Containerfile can COPY the benchmark manifests (installed under /bench).
function prepareBenchDeps() {
  if (!existsSync(BENCH_DEPS_SRC)) die(`image: missing ${BENCH_DEPS_SRC} (benchmark deps) - cannot build the merged website+benchmark image`);
  rmSync(BENCH_DEPS_STAGE, {recursive: true, force: true});
  mkdirSync(BENCH_DEPS_STAGE, {recursive: true});
  // Copy the tree contents (the .../ children), like `cp -R src/. stage/`.
  cpSync(BENCH_DEPS_SRC, BENCH_DEPS_STAGE, {recursive: true});
}

// Stage the pre-publish e2e's toolchain manifests (_deps) + verdaccio registry
// assets (registry/) into the website build context so the merged Containerfile
// can COPY them (baked under /e2e + /etc/verdaccio + /usr/local/bin).
function prepareE2eDeps() {
  if (!existsSync(E2E_DEPS_SRC)) die(`image: missing ${E2E_DEPS_SRC} (pre-publish e2e deps) - cannot build the shared image`);
  if (!existsSync(E2E_REGISTRY_SRC)) die(`image: missing ${E2E_REGISTRY_SRC} (pre-publish e2e registry assets) - cannot build the shared image`);
  rmSync(E2E_DEPS_STAGE, {recursive: true, force: true});
  mkdirSync(E2E_DEPS_STAGE, {recursive: true});
  cpSync(E2E_DEPS_SRC, E2E_DEPS_STAGE, {recursive: true});
  rmSync(E2E_REGISTRY_STAGE, {recursive: true, force: true});
  mkdirSync(E2E_REGISTRY_STAGE, {recursive: true});
  cpSync(E2E_REGISTRY_SRC, E2E_REGISTRY_STAGE, {recursive: true});
}

// Optional build-arg overrides: RT_WEBSITE_BASE_IMAGE swaps the Node 26 base;
// RT_WEBSITE_PNPM_VERSION overrides the pinned pnpm. Honored by build + push.
function buildArgFlags(cfg) {
  const flags = [];
  if (cfg.baseImage) flags.push('--build-arg', `BASE_IMAGE=${cfg.baseImage}`);
  if (cfg.pnpmVersion) flags.push('--build-arg', `PNPM_VERSION=${cfg.pnpmVersion}`);
  return flags;
}

function buildImage(cfg) {
  requireEngine(cfg.engine);
  prepareCacerts(cfg);
  prepareBenchDeps();
  prepareE2eDeps();
  const flags = buildArgFlags(cfg);
  note(`building ${cfg.image} from container/website/Containerfile (merged website + benchmark deps)`);
  const net = cfg.buildNetwork ? [`--network=${cfg.buildNetwork}`] : [];
  // Pin the local build to the host arch so it is ALWAYS native, even right after a
  // multi-arch push left a foreign-arch base tag in local storage.
  runOrThrow(cfg.engine, ['build', '--platform', `linux/${hostGoArch()}`, ...net, ...flags, '-t', cfg.image, '-f', 'Containerfile', '.'], {cwd: WEBSITE_DIR});
}

// The host-arch image-manifest digest from an OCI index / manifest list (the JSON
// `podman manifest inspect` prints). Empty when the host arch can't be determined
// or is absent from the index. Replaces the shell awk with a JSON.parse.
function hostArchDigestFromIndex(engine, indexJson) {
  const arch = capture(engine, ['info', '--format', '{{.Host.Arch}}']).stdout.trim();
  if (!arch) return '';
  let index;
  try {
    index = JSON.parse(indexJson);
  } catch {
    return '';
  }
  const manifests = Array.isArray(index?.manifests) ? index.manifests : [];
  const match = manifests.find((m) => m?.platform?.architecture === arch);
  return match?.digest ?? '';
}

// Make the working image ready. DEFAULT: use the published GHCR image, but SKIP the
// pull when the local image is ALREADY that image (compare digests, read as a
// manifest/index only — KBs, NO layer download). Pull only when the local image is
// missing or not the published latest; fall back to an existing local image when
// the registry is unreachable, then to a local build. RT_WEBSITE_USE_LOCAL=1 skips
// the registry entirely.
export function ensureImage(opts = {}) {
  const cfg = config(opts.env);
  requireEngine(cfg.engine);
  if (cfg.useLocal) return ensureImageLocal(cfg);
  if (imageExists(cfg.engine, cfg.image)) {
    const index = capture(cfg.engine, ['manifest', 'inspect', cfg.remoteImage]).stdout.trim();
    if (!index) {
      noteErr(`registry unreachable - using existing local image ${cfg.image} (no pull)`);
      return;
    }
    const localDigest = capture(cfg.engine, ['image', 'inspect', cfg.image, '--format', '{{.Digest}}']).stdout.trim();
    const remoteDigest = hostArchDigestFromIndex(cfg.engine, index);
    if (localDigest && localDigest === remoteDigest) {
      noteErr(`local image ${cfg.image} already matches published ${cfg.remoteImage} (${remoteDigest}) - skipping pull`);
      return;
    }
    noteErr(`local image is not the published latest - pulling ${cfg.remoteImage}`);
  }
  if (ghcrTryPullRetag(cfg.engine, cfg.remoteImage, cfg.image)) return;
  if (imageExists(cfg.engine, cfg.image)) {
    noteErr(`using existing local image ${cfg.image}`);
    return;
  }
  noteErr('no published or local image available - building locally');
  buildImage(cfg);
}

// Local-image path: build when missing, and rebuild when any baked manifest (or the
// Containerfile) is newer than the cached image. Bind-mounted source never needs a
// rebuild (mounted live).
function ensureImageLocal(cfg) {
  if (!imageExists(cfg.engine, cfg.image)) return buildImage(cfg);
  const imgEpoch = Number(capture(cfg.engine, ['image', 'inspect', cfg.image, '--format', '{{.Created.Unix}}']).stdout.trim()) || 0;
  let srcEpoch = 0;
  const mtimeSec = (f) => Math.floor(statSync(f).mtimeMs / 1000);
  for (const f of [join(WEBSITE_DIR, 'Containerfile'), join(DEPS_DIR, 'package.json'), join(DEPS_DIR, 'pnpm-lock.yaml'), join(DEPS_DIR, 'pnpm-workspace.yaml'), join(DEPS_DIR, '.npmrc')]) {
    if (existsSync(f)) srcEpoch = Math.max(srcEpoch, mtimeSec(f));
  }
  // Benchmark manifests are baked into the same merged image, so a bench dep bump
  // must rebuild it too.
  if (existsSync(BENCH_DEPS_SRC)) {
    for (const rel of globSync('**/*', {cwd: BENCH_DEPS_SRC})) {
      const full = join(BENCH_DEPS_SRC, rel);
      if (statSync(full).isFile()) srcEpoch = Math.max(srcEpoch, mtimeSec(full));
    }
  }
  // The pre-publish e2e toolchains + registry assets are baked here too — a bump
  // to either must rebuild the shared image.
  for (const dir of [E2E_DEPS_SRC, E2E_REGISTRY_SRC]) {
    if (!existsSync(dir)) continue;
    for (const rel of globSync('**/*', {cwd: dir})) {
      const full = join(dir, rel);
      if (statSync(full).isFile()) srcEpoch = Math.max(srcEpoch, mtimeSec(full));
    }
  }
  if (srcEpoch > imgEpoch) {
    note('image is stale (Containerfile or a manifest newer than image) - rebuilding');
    buildImage(cfg);
  }
}

export function cmdLogin(opts = {}) {
  const cfg = config(opts.env);
  requireEngine(cfg.engine);
  ghcrLogin(cfg.engine);
}

export function cmdPush(opts = {}) {
  const cfg = config(opts.env);
  requireEngine(cfg.engine);
  prepareCacerts(cfg);
  prepareBenchDeps();
  prepareE2eDeps();
  ghcrPushMultiarch(cfg.engine, MANIFEST_NAME, WEBSITE_DIR, cfg.remoteImage, cfg.buildNetwork, buildArgFlags(cfg));
}

export function cmdPull(opts = {}) {
  const cfg = config(opts.env);
  requireEngine(cfg.engine);
  ghcrPullRetag(cfg.engine, cfg.remoteImage, cfg.image);
}

// Regenerate _deps/pnpm-lock.yaml inside the container, so the host stays free of
// package-manager files. The supported "bump a website dep" step.
export function cmdLock(opts = {}) {
  const cfg = config(opts.env);
  ensureImage(opts);
  note('regenerating _deps/pnpm-lock.yaml inside the container');
  const net = cfg.runNetwork ? [`--network=${cfg.runNetwork}`] : [];
  runOrThrow(cfg.engine, ['run', '--rm', '--init', ...net, '-v', `${DEPS_DIR}:/lock${cfg.mountOpts}`, '-w', '/lock', cfg.image, 'pnpm', 'install', '--lockfile-only', '--no-frozen-lockfile']);
}

export function cmdClean(opts = {}) {
  const cfg = config(opts.env);
  requireEngine(cfg.engine);
  note(`removing image ${cfg.image} and named volumes`);
  capture(cfg.engine, ['rmi', '-f', cfg.image]); // ignore "no such image"
  capture(cfg.engine, ['volume', 'rm', '-f', cfg.volNuxt, cfg.volData, cfg.volCache]);
}

// ── pre-publish e2e registry (verdaccio-in-container) ────────────────────────
// Start the shared image running its baked verdaccio (e2e-serve.sh): the mounted
// tarballs are published to its own :4873, exposed on 127.0.0.1:<port>, and the
// e2e source is mounted read-only at /e2e-src for the in-container matrix run.
// The healthcheck flips to `healthy` only after every tarball is published.
// Returns the coordinates so the caller (scripts/release/e2e.mjs) can wait for
// health, `podman exec` the matrix, drive the host-native smoke, then stopRegistry.
export function startRegistry(opts = {}) {
  const cfg = config(opts.env);
  if (!opts.tarballsDir || !existsSync(opts.tarballsDir)) die(`image: registry: tarballs dir '${opts.tarballsDir ?? ''}' not found (run: rtx release binaries && rtx release pack)`);
  if (!opts.e2eSrcDir || !existsSync(opts.e2eSrcDir)) die(`image: registry: e2e source dir '${opts.e2eSrcDir ?? ''}' not found`);
  ensureImage(opts);
  const container = `${cfg.containerBase}-e2e-registry`;
  const port = String(opts.port || '4873');
  const net = cfg.runNetwork ? [`--network=${cfg.runNetwork}`] : [];
  capture(cfg.engine, ['rm', '-f', container]); // drop any stale container
  note(`starting containerized verdaccio (${container}) on 127.0.0.1:${port}`);
  runOrThrow(
    cfg.engine,
    [
      'run', '-d', '--init', '--name', container,
      '-v', `${opts.tarballsDir}:/tarballs:ro${cfg.mountOpts}`,
      '-v', `${opts.e2eSrcDir}:/e2e-src:ro${cfg.mountOpts}`,
      '-p', `127.0.0.1:${port}:4873`,
      ...net,
      '--health-cmd', 'test -f /tmp/registry-ready',
      '--health-interval', '2s',
      '--health-retries', '90',
      '--health-start-period', '2s',
      cfg.image,
      '/usr/local/bin/e2e-serve.sh',
    ],
    {stdio: ['inherit', 'ignore', 'inherit']}
  );
  return {engine: cfg.engine, container, port, image: cfg.image};
}

// Remove the registry container (best-effort; ignores "no such container").
export function stopRegistry(engine, container) {
  capture(engine, ['rm', '-f', container]);
}

export function buildImageCmd(opts = {}) {
  buildImage(config(opts.env));
}

export function main(args) {
  switch (args[0]) {
    case 'build-image': return buildImageCmd();
    case 'ensure': return ensureImage();
    case 'login': return cmdLogin();
    case 'push': return cmdPush();
    case 'pull': return cmdPull();
    case 'lock': return cmdLock();
    case 'clean': return cmdClean();
    default: die(`image: unknown command '${args[0] ?? ''}'. Try: build-image | ensure | login | push | pull | lock | clean`);
  }
}

if (import.meta.main) {
  loadEnv();
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
