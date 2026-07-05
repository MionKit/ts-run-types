#!/usr/bin/env node
// rt — the internal RunTypes repo CLI. A single zero-dependency Node ESM
// dispatcher over the area modules under scripts/ (core, website, bench,
// container, env, release). INTERNAL tooling for maintainers — NOT a public CLI
// for RunTypes. Run as `pnpm rt <area> <command>` (or `node scripts/rt.mjs …`).
//
// THE entry point: loadEnv() runs once here, then dispatch imports the area
// modules IN-PROCESS (they inherit the loaded process.env) or spawns the tools
// they drive (go/podman/pnpm/vitest/git/npm) with stdio inherited. Leaves throw a
// CliError on failure (never process.exit); this file catches it, prints, and sets
// process.exitCode. See docs/todos/scripts-shell-to-mjs-migration.md.
import {spawnSync} from 'node:child_process';
import {main as coreBuild} from './core/build.mjs';
import {loadEnv} from './lib/env.mjs';
import {CliError, reportCliError} from './lib/proc.mjs';

// ── spawn helpers ──────────────────────────────────────────────────────────
// Run one command to completion (stdio inherited); return its exit code.
function exec(cmd, args = [], extraEnv) {
  const env = extraEnv ? {...process.env, ...extraEnv} : process.env;
  const result = spawnSync(cmd, args, {stdio: 'inherit', env});
  if (result.error) {
    console.error(`rt: failed to launch ${cmd}: ${result.error.message}`);
    return 1;
  }
  return typeof result.status === 'number' ? result.status : 1;
}
// Run one command; a non-zero code throws a code-only CliError (the child already
// printed its own error). Success returns and dispatch completes with exit 0.
function proxy(cmd, args = [], extraEnv) {
  const code = exec(cmd, args, extraEnv);
  if (code !== 0) throw new CliError('', code);
}
// Run [cmd, args, env?] steps in order; first non-zero short-circuits (throws).
function steps(list) {
  for (const step of list) proxy(step[0], step[1] ?? [], step[2]);
}
// Build the engine first (throws CliError on its failure), then continue in-process.
function ensureBuilt() {
  coreBuild(['all']);
}
const hasFlag = (args, ...names) => args.some((a) => names.includes(a));
function takeFlag(args, flag, {valued = false} = {}) {
  const i = args.indexOf(flag);
  if (i === -1) return {value: undefined, rest: args};
  if (!valued) return {value: true, rest: [...args.slice(0, i), ...args.slice(i + 1)]};
  return {value: args[i + 1], rest: [...args.slice(0, i), ...args.slice(i + 2)]};
}
const die = (msg, code = 1) => {
  throw new CliError(`rt: ${msg}`, code);
};

// ── core: the engine (Go resolver + TS marker/plugin) ──────────────────────
const FUZZ = {
  unit: {config: 'packages/ts-runtypes/test/fuzz/vitest.fuzz-unit.config.ts'},
  value: {patterns: ['fuzz.integration'], soak: {RT_FUZZ_SOAK_MS: '60000'}},
  types: {patterns: ['typeFuzz.integration'], soak: {RT_FUZZ_TYPES_SOAK_MS: '60000'}},
  enrich: {patterns: ['enrichFuzz.integration'], soak: {RT_FUZZ_ENRICH_SEQUENCES: '400', RT_FUZZ_ENRICH_MAXCMDS: '24'}},
  i18n: {patterns: ['i18nFuzz.integration'], soak: {RT_FUZZ_I18N_SEQUENCES: '400', RT_FUZZ_I18N_MAXCMDS: '24'}},
  typemod: {patterns: ['typeModFuzz.integration'], soak: {RT_FUZZ_TYPEMOD_REPORT: '1', RT_FUZZ_TYPEMOD_SEQUENCES: '400', RT_FUZZ_TYPEMOD_MAXSTEPS: '20'}},
  // race is the ONLY path that sets RT_FUZZ_RACE=1 — without it enrichRace self-skips.
  race: {patterns: ['enrichRace'], env: {RT_FUZZ_RACE: '1'}, soak: {RT_FUZZ_RACE_ITERATIONS: '25', RT_FUZZ_RACE_FANOUT: '8'}},
  all: {patterns: ['fuzz.integration', 'typeFuzz.integration', 'binaryEncoderResize']},
};
// Go→TS mirror -> pnpm gen script + committed outputs + which need oxfmt afterwards
// (the Go generators emit unformatted TS; diag self-formats via prettier).
const CODEGEN = {
  constants: {script: 'gen:ts-constants', outputs: ['packages/ts-runtypes-devtools/src/runtypes-constants.generated.ts'], fmt: ['packages/ts-runtypes-devtools/src/runtypes-constants.generated.ts']},
  kind: {script: 'gen:run-type-kind', outputs: ['packages/ts-runtypes/src/runTypeKind.ts'], fmt: ['packages/ts-runtypes/src/runTypeKind.ts']},
  diag: {script: 'gen:diag-catalog', outputs: ['packages/ts-runtypes-devtools/src/diagnosticCatalog.generated.ts', 'container/website/app/components/content/diagnostics-catalog.json'], fmt: []},
};

function runCodegen(args) {
  const check = hasFlag(args, '--check');
  const which = args.find((a) => !a.startsWith('-')) ?? 'all';
  const names = which === 'all' ? Object.keys(CODEGEN) : [which];
  for (const name of names) if (!CODEGEN[name]) die(`unknown codegen target '${name}'. Try: all | ${Object.keys(CODEGEN).join(' | ')} [--check]`);
  for (const name of names) {
    proxy('pnpm', ['run', CODEGEN[name].script]);
    if (CODEGEN[name].fmt.length) proxy('pnpm', ['exec', 'oxfmt', '--write', ...CODEGEN[name].fmt]);
  }
  if (!check) return;
  const outputs = names.flatMap((name) => CODEGEN[name].outputs);
  if (exec('git', ['diff', '--exit-code', '--', ...outputs]) !== 0) die('codegen drift — a committed Go→TS mirror is stale. Run `rt core codegen all` and commit.');
}

function runCore(args) {
  const [sub, ...rest] = args;
  if (sub === 'build') return coreBuild(rest);
  if (sub === 'smoke') return (ensureBuilt(), proxy('node', ['scripts/core/smoke.mjs', ...rest]));
  if (sub === 'codegen') return runCodegen(rest);
  if (sub === 'fuzz') {
    const suite = FUZZ[rest[0]];
    if (!suite) die(`unknown fuzz suite '${rest[0] ?? ''}'. Try: ${Object.keys(FUZZ).join(' | ')} [--soak]`);
    const {value: soak, rest: extra} = takeFlag(rest.slice(1), '--soak');
    const env = {...(suite.env ?? {}), ...(soak ? suite.soak ?? {} : {})};
    ensureBuilt();
    if (suite.config) return proxy('pnpm', ['exec', 'vitest', 'run', '--config', suite.config, ...extra], env);
    return proxy('pnpm', ['exec', 'vitest', 'run', ...suite.patterns, ...extra], env);
  }
  die('usage: rt core <build|smoke|fuzz <suite>|codegen [--check]>');
}

// ── website ────────────────────────────────────────────────────────────────
function runWebsite(args) {
  const [sub, ...rest] = args;
  if (sub === 'dev') {
    const {value: agent, rest: pass} = takeFlag(rest, '--agent');
    return proxy('bash', ['scripts/website/site.sh', 'dev', ...(agent ? ['--isAgent'] : []), ...pass]);
  }
  if (sub === 'build') {
    let a = rest;
    const target = hasFlag(a, '--ssr') ? 'build' : 'generate';
    a = takeFlag(a, '--ssr').rest;
    const skip = takeFlag(a, '--skip-playground');
    return proxy('bash', ['scripts/website/build.sh', target, ...skip.rest], skip.value ? {RT_WEBSITE_SKIP_PLAYGROUND: '1'} : undefined);
  }
  if (sub === 'preview') {
    proxy('bash', ['scripts/website/site.sh', 'generate']);
    return proxy('node', ['scripts/website/serve.mjs', ...rest]);
  }
  if (sub === 'check') return proxy('bash', ['scripts/website/site.sh', hasFlag(rest, '--docs') ? 'verify-docs' : 'smoke']);
  die('usage: rt website <dev [--agent]|build [--no-bench|--quick|--ssr|--skip-playground]|preview|check [--docs]>');
}

// ── bench ────────────────────────────────────────────────────────────────
const BENCH_SUB = new Set(['audit', 'typecost', 'compiletime', 'serialization', 'smoke', 'prep', 'clean', 'capture-env', 'shell', 'transform-wire', 'fullbench', 'website-bench', 'bench-one', 'build']);
function runBench(args) {
  if (args[0] && !args[0].startsWith('-') && BENCH_SUB.has(args[0])) return proxy('bash', ['scripts/website/bench-data/bench.sh', ...args]);
  const one = takeFlag(args, '--one', {valued: true});
  if (one.value !== undefined) return proxy('bash', ['scripts/website/bench-data/bench.sh', 'bench-one', one.value, ...one.rest]);
  const full = takeFlag(args, '--full');
  if (full.value) return proxy('bash', ['scripts/website/bench-data/bench.sh', 'fullbench', ...full.rest]);
  const web = takeFlag(args, '--website');
  if (web.value) return proxy('bash', ['scripts/website/bench-data/bench.sh', 'website-bench', ...web.rest]);
  const buildOnly = takeFlag(args, '--build-only');
  if (buildOnly.value) return proxy('bash', ['scripts/website/bench-data/bench.sh', 'build', ...buildOnly.rest]);
  const stray = args.find((a) => !a.startsWith('-'));
  if (stray) die(`unknown bench target '${stray}'. Try a flag (--one/--full/--website/--build-only) or a sub-verb.`);
  proxy('bash', ['scripts/website/bench-data/bench.sh', 'bench', ...args]);
}

// ── release: npm publish + orchestrate the site build/deploy ────────────────
function runRelease(args) {
  const [sub, ...rest] = args;
  const map = {
    preflight: ['bash', ['scripts/release/preflight.sh']],
    npm: ['bash', ['scripts/release/publish.sh']],
    website: ['bash', ['scripts/website/build.sh', 'generate']],
    unpublish: ['bash', ['scripts/release/unpublish.sh']],
    bump: ['node', ['scripts/release/bump-version.mjs']],
    dists: ['pnpm', ['-r', 'run', 'build']],
    binaries: ['node', ['scripts/release/build-binaries.mjs']],
    pack: ['node', ['scripts/release/pack.mjs']],
    tarballs: ['node', ['scripts/release/publish-tarballs.mjs']],
  };
  if (map[sub]) return proxy(map[sub][0], [...map[sub][1], ...rest]);
  // Umbrella (no sub): preflight -> npm publish -> website build. Deploy is CI-only.
  const preflightOnly = hasFlag(args, '--preflight-only');
  const noWebsite = hasFlag(args, '--no-website');
  const plan = [['bash', ['scripts/release/preflight.sh']]];
  if (!preflightOnly) {
    plan.push(['bash', ['scripts/release/publish.sh']]);
    if (!noWebsite) plan.push(['bash', ['scripts/website/build.sh', 'generate']]);
  }
  if (hasFlag(args, '--dry-run')) {
    console.log('rt release would run, in order:');
    for (const [cmd, a] of plan) console.log(`  ${cmd} ${a.join(' ')}`);
    console.log('(website deploy to Cloudflare Pages stays CI-only — see publish.yml)');
    return;
  }
  steps(plan);
}

// In-process env leaf (env/check.mjs). Migrated leaves import + call their main().
async function runEnv(args) {
  const {main} = await import('./env/check.mjs');
  main(args);
}

// ── dispatch ────────────────────────────────────────────────────────────────
const HELP = `rt — internal RunTypes dev/build/publish CLI  (run as: pnpm rt <area> <command>)

core     the engine (Go resolver + TS marker/plugin)
  rt core build [targets…]        build the binary + dev dists if stale
  rt core smoke                   end-to-end smoke of the resolver + devtools
  rt core fuzz <suite> [--soak]   unit|value|types|enrich|i18n|typemod|race|all
  rt core codegen [all|constants|kind|diag] [--check]   regenerate Go→TS mirrors

website
  rt website dev [--agent]        hot-reload docs server (:3000, or :3100 --agent)
  rt website build [--no-bench]   build the docs site (WITH benchmarks; --no-bench reuses data)
                    [--quick] [--ssr] [--skip-playground]
  rt website preview              generate the static site, then serve it locally
  rt website check [--docs]       serves-a-page smoke (code-import + twoslash with --docs)

bench
  rt bench [--one <name>|--full|--website|--build-only] [--quick]
  rt bench <audit|typecost|compiletime|serialization|smoke>

release   npm publish + site build (deploy stays CI-only)
  rt release [--preflight-only] [--no-website] [--dry-run]
  rt release <preflight|npm|website|bump <v>|dists|binaries|pack|tarballs|unpublish>

container  rt container <build-image|ensure|login|push|pull|lock|clean>
env        rt env [push-image|publish-npm|deploy-website|--create-env]

verify     build if stale, then lint + typecheck + format check
fmt        format (oxfmt + prettier + gofmt); --check is read-only
clean      clean build outputs; --deep also wipes node_modules
`;

async function dispatch(argv) {
  const [verb, ...rest] = argv;
  switch (verb) {
    case 'core': return runCore(rest);
    case 'website': return runWebsite(rest);
    case 'bench': return runBench(rest);
    case 'release': return runRelease(rest);
    case 'container': return proxy('bash', ['scripts/container/image.sh', ...rest]);
    case 'env': return runEnv(rest);
    case 'verify': return (coreBuild(['all']), steps([['pnpm', ['run', 'lint']], ['pnpm', ['run', 'check-format']]]));
    case 'fmt': return proxy('pnpm', ['run', hasFlag(rest, '--check') ? 'check-format' : 'format']);
    case 'clean': return proxy('pnpm', ['run', hasFlag(rest, '--deep') ? 'fresh-start' : 'clean']);
    case undefined:
    case 'help':
    case '-h':
    case '--help':
      process.stdout.write(HELP);
      return;
    default:
      die(`unknown command '${verb}'. Run \`pnpm rt --help\`.`, 2);
  }
}

loadEnv();
try {
  await dispatch(process.argv.slice(2));
} catch (err) {
  reportCliError(err);
}
