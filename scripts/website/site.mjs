// site.mjs — RUN the isolated (podman) docs-website environment. Port of the former
// scripts/website/site.sh. The image lifecycle lives in scripts/container/image.mjs
// (imported here for `ensure`); this module only RUNS the site in that shared image.
//
// The website's source (app/ content/ public/ server/ scripts/) is bind-mounted so
// edits hot-reload; config + node_modules come from the image. You cannot run the
// site on the host.
//
// Commands: dev [--isAgent] | build | generate | smoke | verify-docs | shell.
// TTY commands (dev/build/generate/shell) run podman with stdio inherited so SIGINT
// (Ctrl-C) reaches the container via the shared process group and --rm cleans up.
// smoke/verify-docs boot a detached server and poll it with fetch(), removing the
// container on exit/SIGINT/SIGTERM. The in-container `sh -c '…'` blocks stay shell
// (they run inside the Linux container, which always has sh).

import {existsSync, globSync, mkdirSync, realpathSync, statSync} from 'node:fs';
import {join} from 'node:path';
import {ensureImage} from '../container/image.mjs';
import {loadEnv, REPO_ROOT} from '../lib/env.mjs';
import {requireEngine} from '../lib/engine.mjs';
import {capture, die, note, reportCliError, run, sleep, warn, which} from '../lib/proc.mjs';

const WEBSITE_DIR = join(REPO_ROOT, 'container/website');
// Source directories bind-mounted into /app (host is the source of truth).
const MOUNT_DIRS = ['app', 'content', 'public', 'server', 'scripts', 'not-rendered', 'tests'];
// Config files bind-mounted into /app (first-party, NOT baked into the image).
const MOUNT_FILES = ['nuxt.config.ts', 'tsconfig.json', 'eslint.config.mjs'];

// Repo context: the checkout that contains packages/ (first-party source + built
// .d.ts). This repo carries packages/examples, so prefer it; only fall back to a
// sibling ../mion checkout for a legacy split layout.
function defaultRepoContext() {
  if (existsSync(join(REPO_ROOT, 'packages/examples'))) return REPO_ROOT;
  if (existsSync(join(REPO_ROOT, '../mion/packages'))) return realpathSync(join(REPO_ROOT, '..', 'mion'));
  return REPO_ROOT;
}

// Env-dependent config, read fresh (matches lib.sh + site.sh's var block).
function config(env = process.env) {
  const containerBase = env.RT_WEBSITE_CONTAINER || 'tsrt-website';
  // Watcher polling: bind mounts on macOS deliver no native fs events, so default
  // it on there; Linux passes events through natively. Override with RT_WEBSITE_POLL.
  let poll = env.RT_WEBSITE_POLL;
  if (poll === undefined || poll === '') poll = process.platform === 'darwin' ? '1' : '0';
  return {
    engine: env.RT_WEBSITE_ENGINE || 'podman',
    image: env.RT_WEBSITE_IMAGE || 'tsrt-website:dev',
    containerBase,
    mountOpts: env.RT_WEBSITE_MOUNT_OPTS || '',
    port: env.RT_WEBSITE_PORT || '3000',
    agentPort: env.RT_WEBSITE_AGENT_PORT || '3100',
    agentIdle: env.RT_WEBSITE_AGENT_IDLE_SECONDS || '300',
    poll,
    runNetwork: env.RT_WEBSITE_RUN_NETWORK || '',
    repoContext: env.RT_WEBSITE_REPO_CONTEXT || defaultRepoContext(),
    docdataDir: env.RT_WEBSITE_DOCDATA || join(REPO_ROOT, '.docdata'),
    skipPlayground: env.RT_WEBSITE_SKIP_PLAYGROUND === '1',
    smokeTimeout: env.RT_WEBSITE_SMOKE_TIMEOUT || '',
    volNuxt: `${containerBase}-nuxt`,
    volData: `${containerBase}-data`,
    volCache: `${containerBase}-cache`,
  };
}

// The bind-mount + named-volume `-v …` args for `run`.
function mountArgs(cfg) {
  const args = [];
  for (const dir of MOUNT_DIRS) {
    if (existsSync(join(WEBSITE_DIR, dir))) args.push('-v', `${join(WEBSITE_DIR, dir)}:/app/${dir}${cfg.mountOpts}`);
  }
  for (const file of MOUNT_FILES) {
    if (existsSync(join(WEBSITE_DIR, file))) args.push('-v', `${join(WEBSITE_DIR, file)}:/app/${file}:ro${cfg.mountOpts}`);
  }
  // Repo context, READ-ONLY: only packages/ (+ the drizzle-orm d.ts allowlist) is
  // exposed, never the repo root, so code-import/twoslash can read first-party code
  // + types but nothing else. RT_REPO_ROOT=/repo-context (see envArgs).
  if (existsSync(join(cfg.repoContext, 'packages'))) args.push('-v', `${join(cfg.repoContext, 'packages')}:/repo-context/packages:ro${cfg.mountOpts}`);
  if (existsSync(join(cfg.repoContext, 'node_modules/drizzle-orm'))) args.push('-v', `${join(cfg.repoContext, 'node_modules/drizzle-orm')}:/repo-context/node_modules/drizzle-orm:ro${cfg.mountOpts}`);
  // Generated benchmark/test results the docs read (RT_DOCDATA=/app/.docdata).
  mkdirSync(cfg.docdataDir, {recursive: true});
  args.push('-v', `${cfg.docdataDir}:/app/.docdata:ro${cfg.mountOpts}`);
  args.push('-v', `${cfg.volNuxt}:/app/.nuxt`);
  args.push('-v', `${cfg.volData}:/app/.data`);
  args.push('-v', `${cfg.volCache}:/app/node_modules/.cache`);
  return args;
}

const netArgs = (cfg) => (cfg.runNetwork ? [`--network=${cfg.runNetwork}`] : []);
// RT_REPO_ROOT/RT_DOCDATA point the resolvers at the mounted repo context + results.
const envArgs = () => ['-e', 'RT_REPO_ROOT=/repo-context', '-e', 'RT_DOCDATA=/app/.docdata'];
// CHOKIDAR_USEPOLLING (read by nuxt.config.ts) switches watchers to polling — the
// only reliable mode over a bind mount that delivers no native fs events.
const pollArgs = (cfg) => (cfg.poll === '1' ? ['-e', 'CHOKIDAR_USEPOLLING=true'] : []);

// Stage the playground assets (resolver WASM + ts-runtypes source overlay) the
// /playground page fetches. build-playground.mjs is itself staleness-gated (instant
// no-op when nothing changed), so we just invoke it before serving.
function ensurePlayground(cfg) {
  if (cfg.skipPlayground) return note('RT_WEBSITE_SKIP_PLAYGROUND=1 - skipping playground assets');
  if (!which('go')) {
    warn('Go toolchain not found - skipping playground build (the /playground page will 404). Install Go + bootstrap submodules (SETUP.md), or set RT_WEBSITE_SKIP_PLAYGROUND=1 to silence.');
    return;
  }
  if (run('node', [join(WEBSITE_DIR, 'scripts/build-playground.mjs')]) !== 0) {
    warn('playground build failed - the site will run but /playground will 404 (see output above; needs Go + bootstrapped submodule, SETUP.md).');
  }
}

// Remove a container by name, swallowing "no such container".
const rmContainer = (cfg, name) => capture(cfg.engine, ['rm', '-f', name]);

function cmdDev(cfg, args) {
  let isAgent = false;
  for (const arg of args) {
    if (arg === '--isAgent' || arg === '--is-agent') isAgent = true;
    else die(`site: dev: unknown option '${arg}' (only --isAgent is supported)`);
  }
  ensureImage();
  const margs = mountArgs(cfg);
  const pargs = pollArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs();
  if (isAgent) return cmdDevAgent(cfg, margs, pargs, nargs, eargs);

  // --rm cleans up on a clean exit; an ungraceful kill leaves the named container
  // behind and the next run collides. Remove any stale one first (user container only).
  rmContainer(cfg, `${cfg.containerBase}-dev`);
  note(`dev server at http://localhost:${cfg.port}  (Ctrl-C to stop)`);
  const code = run(cfg.engine, ['run', '--rm', '-it', '--init', '--name', `${cfg.containerBase}-dev`, '-p', `${cfg.port}:3000`, ...nargs, ...margs, ...pargs, ...eargs, '-e', 'NODE_ENV=development', '-w', '/app', cfg.image, 'pnpm', 'exec', 'nuxt', 'dev', '--extends', 'docus', '--host', '0.0.0.0', '--port', '3000']);
  if (code !== 0) die('', code);
}

// The in-container watchdog: stop nuxt once the heartbeat file (bumped per request
// by server/middleware/agent-heartbeat.ts) goes stale. Runs inside the Linux
// container, so it stays shell.
const AGENT_WATCHDOG = `
      hb="$RT_AGENT_HEARTBEAT"; idle="\${RT_AGENT_IDLE_SECONDS:-300}"
      touch "$hb"
      pnpm exec nuxt dev --extends docus --host 0.0.0.0 --port 3000 &
      nuxt_pid=$!
      while kill -0 "$nuxt_pid" 2>/dev/null; do
        sleep 30
        last=$(stat -c %Y "$hb" 2>/dev/null || echo 0)
        now=$(date +%s)
        if [ $((now - last)) -ge "$idle" ]; then
          echo "agent: idle \${idle}s with no requests, stopping nuxt"
          kill "$nuxt_pid" 2>/dev/null || true
          break
        fi
      done
      wait "$nuxt_pid" 2>/dev/null || true
    `;

function cmdDevAgent(cfg, margs, pargs, nargs, eargs) {
  const cname = `${cfg.containerBase}-agent`;
  note(`agent dev server at http://localhost:${cfg.agentPort}  (detached; self-stops after ${cfg.agentIdle}s idle)`);
  rmContainer(cfg, cname);
  // Detached; discard the printed container id (stdout), keep stderr.
  run(cfg.engine, ['run', '-d', '--rm', '--init', '--name', cname, '-p', `${cfg.agentPort}:3000`, ...nargs, ...margs, ...pargs, ...eargs, '-e', 'NODE_ENV=development', '-e', 'RT_AGENT=1', '-e', 'RT_AGENT_HEARTBEAT=/tmp/agent-heartbeat', '-e', `RT_AGENT_IDLE_SECONDS=${cfg.agentIdle}`, '-w', '/app', cfg.image, 'sh', '-c', AGENT_WATCHDOG], {stdio: ['inherit', 'ignore', 'inherit']});
  note(`started detached as '${cname}'. Logs: ${cfg.engine} logs -f ${cname}   Stop early: ${cfg.engine} stop ${cname}`);
}

function cmdBuild(cfg) {
  ensureImage();
  note('production build -> container/website/.output');
  const margs = mountArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs();
  const code = run(cfg.engine, ['run', '--rm', '--init', '--name', `${cfg.containerBase}-build`, ...nargs, ...margs, ...eargs, '-v', `${join(WEBSITE_DIR, '.output')}:/app/.output${cfg.mountOpts}`, '-e', 'NODE_ENV=production', '-w', '/app', cfg.image, 'pnpm', 'exec', 'nuxt', 'build', '--extends', 'docus']);
  if (code !== 0) die('', code);
}

// nitro's generate rmdir's /app/.output while finalizing; bind-mounting .output
// directly makes it a mount point, so that rmdir fails with EBUSY. Generate into the
// container's own /app/.output (freely removable), then mirror onto the host bind
// mount (/app/.output-host). Runs inside the container, so it stays shell.
const GENERATE_SCRIPT = `pnpm exec nuxt generate --extends docus \\
      && node scripts/embed-panel-highlights.mjs /app/.output/public \\
      && find /app/.output-host -mindepth 1 -delete \\
      && cp -a /app/.output/. /app/.output-host/`;

function cmdGenerate(cfg) {
  ensureImage();
  note('static prerender -> container/website/.output/public');
  const margs = mountArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs();
  const code = run(cfg.engine, ['run', '--rm', '--init', '--name', `${cfg.containerBase}-generate`, ...nargs, ...margs, ...eargs, '-v', `${join(WEBSITE_DIR, '.output')}:/app/.output-host${cfg.mountOpts}`, '-e', 'NODE_ENV=production', '-e', 'NODE_OPTIONS=--max-old-space-size=6144', '-w', '/app', cfg.image, 'sh', '-c', GENERATE_SCRIPT]);
  if (code !== 0) die('', code);
}

// Register container cleanup on exit / SIGINT / SIGTERM (the `trap … EXIT INT TERM`
// replacement). Returns a function that performs (idempotent) cleanup on demand.
function withCleanup(cfg, cname) {
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    capture(cfg.engine, ['rm', '-f', cname]);
  };
  process.on('exit', cleanup);
  process.on('SIGINT', () => {
    cleanup();
    process.exit(130);
  });
  process.on('SIGTERM', () => {
    cleanup();
    process.exit(143);
  });
  return cleanup;
}

async function cmdSmoke(cfg) {
  ensureImage();
  const cname = `${cfg.containerBase}-smoke`;
  const timeoutS = Number(cfg.smokeTimeout || '90');
  const url = `http://localhost:${cfg.port}`;
  note(`smoke: starting dev server in background (${cname})`);
  rmContainer(cfg, cname);
  const margs = mountArgs(cfg);
  const pargs = pollArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs();
  if (run(cfg.engine, ['run', '-d', '--init', '--name', cname, '-p', `${cfg.port}:3000`, ...nargs, ...margs, ...pargs, ...eargs, '-e', 'NODE_ENV=development', '-w', '/app', cfg.image, 'pnpm', 'exec', 'nuxt', 'dev', '--extends', 'docus', '--host', '0.0.0.0', '--port', '3000'], {stdio: ['inherit', 'ignore', 'inherit']}) !== 0) die('site: podman run failed');
  const cleanup = withCleanup(cfg, cname);

  note(`smoke: polling ${url} for HTTP 200 (timeout ${timeoutS}s)`);
  const deadline = Date.now() + timeoutS * 1000;
  let title = '';
  while (Date.now() < deadline) {
    const html = await tryGet(url);
    if (html && html.includes('<title>')) {
      title = html.match(/<title>[^<]*<\/title>/)?.[0] ?? '';
      break;
    }
    await sleep(2000);
  }

  if (title) {
    note(`smoke: PASS  ${title}`);
    capture(cfg.engine, ['stop', '--time', '1', cname]);
    cleanup();
    return;
  }
  console.error(`==> smoke: FAIL (no 200 from ${url} within ${timeoutS}s)`);
  console.error('==> last 40 lines of container logs:');
  run(cfg.engine, ['logs', '--tail', '40', cname], {stdio: ['inherit', 'inherit', 'inherit']});
  capture(cfg.engine, ['stop', '--time', '1', cname]);
  cleanup();
  die('', 1);
}

// GET a URL, returning the body text on a 2xx, else null (the `curl -fsS` analogue).
async function tryGet(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function cmdVerifyDocs(cfg) {
  ensureImage();
  const cname = `${cfg.containerBase}-verify`;
  const timeoutS = Number(cfg.smokeTimeout || '120');
  const base = `http://localhost:${cfg.port}`;
  // Pick a real example file from the mounted context for the endpoint checks.
  const examples = globSync('**/*.ts', {cwd: join(cfg.repoContext, 'packages/examples/src')});
  if (examples.length === 0) die(`site: no examples found under ${cfg.repoContext}/packages/examples/src - run 'rt website check' after building packages`);
  const relpath = `packages/examples/src/${examples[0]}`;
  note(`verify-docs: example = ${relpath}`);

  rmContainer(cfg, cname);
  const margs = mountArgs(cfg);
  const pargs = pollArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs();
  if (run(cfg.engine, ['run', '-d', '--init', '--name', cname, '-p', `${cfg.port}:3000`, ...nargs, ...margs, ...pargs, ...eargs, '-e', 'NODE_ENV=development', '-w', '/app', cfg.image, 'pnpm', 'exec', 'nuxt', 'dev', '--extends', 'docus', '--host', '0.0.0.0', '--port', '3000'], {stdio: ['inherit', 'ignore', 'inherit']}) !== 0) die('site: podman run failed');
  const cleanup = withCleanup(cfg, cname);

  note(`verify-docs: waiting for ${base} (timeout ${timeoutS}s)`);
  const deadline = Date.now() + timeoutS * 1000;
  let up = false;
  while (Date.now() < deadline) {
    if ((await tryGet(base)) !== null) {
      up = true;
      break;
    }
    await sleep(2000);
  }
  if (!up) {
    run(cfg.engine, ['logs', '--tail', '40', cname], {stdio: ['inherit', 'inherit', 'inherit']});
    cleanup();
    die('site: dev server never came up');
  }

  let fails = 0;
  // 1. twoslash endpoint renders hovers from the mounted packages' .d.ts.
  if ((await postIncludes(`${base}/api/twoslash`, {path: relpath, hoverMode: 'all'}, 'twoslash'))) console.log(`  PASS  twoslash: rendered hovers for ${relpath}`);
  else (console.error(`  FAIL  twoslash: no hover markup for ${relpath}`), (fails = 1));
  // 2. file read (the resolver code-import uses) returns code from the context.
  if ((await postIncludes(`${base}/api/read-file`, {path: relpath}, '"code"'))) console.log(`  PASS  code read: ${relpath}`);
  else (console.error(`  FAIL  code read: ${relpath}`), (fails = 1));
  // 3. security boundary: a path escaping packages/ is rejected (403).
  const code = await postStatus(`${base}/api/read-file`, {path: 'packages/examples/../../package.json'});
  if (code === 403) console.log('  PASS  security: out-of-packages path rejected (403)');
  else (console.error(`  FAIL  security: expected 403, got ${code}`), (fails = 1));
  // 4. homepage server-renders twoslash markup (full SSR path).
  const home = await tryGet(base);
  if (home && home.includes('twoslash')) console.log('  PASS  homepage: twoslash markup present in SSR HTML');
  else console.error('  WARN  homepage: no twoslash markup (homepage may not use ::twoslash-code)');

  cleanup();
  if (fails === 0) return void note('verify-docs: PASS');
  die('site: verify-docs: FAIL');
}

// POST JSON; true if the 2xx body includes `needle`, else false (the `curl … | grep`).
async function postIncludes(url, body, needle) {
  try {
    const res = await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    if (!res.ok) return false;
    return (await res.text()).includes(needle);
  } catch {
    return false;
  }
}
// POST JSON; return the HTTP status (0 on a network error). The `-w '%{http_code}'`.
async function postStatus(url, body) {
  try {
    return (await fetch(url, {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)})).status;
  } catch {
    return 0;
  }
}

function cmdShell(cfg) {
  ensureImage();
  const margs = mountArgs(cfg);
  const nargs = netArgs(cfg);
  const eargs = envArgs();
  const code = run(cfg.engine, ['run', '--rm', '-it', '--init', '--name', `${cfg.containerBase}-shell`, '-p', `${cfg.port}:3000`, ...nargs, ...margs, ...eargs, '-w', '/app', cfg.image, 'bash']);
  if (code !== 0) die('', code);
}

export async function main(args) {
  const cfg = config();
  requireEngine(cfg.engine);
  mkdirSync(join(WEBSITE_DIR, '.output'), {recursive: true});
  const cmd = args[0];
  // Ensure the playground bundle is staged for every command that serves the site.
  if (['dev', 'build', 'generate', 'smoke', 'verify-docs'].includes(cmd)) ensurePlayground(cfg);
  switch (cmd) {
    case 'dev': return cmdDev(cfg, args.slice(1));
    case 'build': return cmdBuild(cfg);
    case 'generate': return cmdGenerate(cfg);
    case 'smoke': return cmdSmoke(cfg);
    case 'verify-docs': return cmdVerifyDocs(cfg);
    case 'shell': return cmdShell(cfg);
    default: die(`site: unknown command '${cmd ?? ''}'. Try: dev | build | generate | smoke | verify-docs | shell  (image lifecycle: pnpm rt container build-image|ensure|login|push|pull|lock|clean)`);
  }
}

if (import.meta.main) {
  loadEnv();
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
