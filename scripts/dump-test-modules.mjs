#!/usr/bin/env node
// Runs the Go binary against the marker package's test sources and emits a
// Vite-build-style snapshot under logs/build/ (or logs/build-<mode>/ for the
// non-default module modes, so runs can be diffed side by side):
//
//   logs/build*/test/suites/<…>/<Fixture>.js  — rewritten fixture source
//                                               (original .ts with the
//                                               import block + tuple-arg
//                                               bindings the plugin would
//                                               splice in at transform).
//   logs/build*/virtual-rt/<basename>.js      — one file per virtual cache
//                                               module (runtype bundle +
//                                               facades + type-fn entries +
//                                               pure-fn entries + missing
//                                               stubs). Identical in shape
//                                               to what Vite's load() hook
//                                               serves for `virtual:rt/<…>`.
//
// Usage:
//   node scripts/dump-test-modules.mjs [--module-mode default|allSingle|allModules] [--emit-mode code|functions|both] [--inline-mode default|allInternal]
//
// --emit-mode selects the code/factory slots (default 'both', matching the
// test config). 'code' (body string only, no g_<hash> factories) and
// 'functions' (factory only, no code string) snapshot under
// logs/build-<emitMode>*/ for byte-size comparisons.
//
// No bundling — every entry module is its own .js, and every fixture
// has its rewritten counterpart at the matching relative path. Browse
// the output dir to inspect what the plugin produces per module mode.

import {spawn} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {ResolverClient} from '../packages/runtypes-devtools/dist/resolver-client.js';
import {rewrite} from '../packages/runtypes-devtools/dist/rewrite.js';
import {
  MODULE_MODE_ALL_MODULES,
  MODULE_MODE_ALL_SINGLE,
  MODULE_MODE_DEFAULT,
} from '../packages/runtypes-devtools/dist/runtypes-constants.generated.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const MARKER_PKG = path.join(REPO_ROOT, 'packages/ts-runtypes');
const SUITES_ROOT = path.join(MARKER_PKG, 'test/suites');
const BIN = path.join(REPO_ROOT, 'bin/ts-runtypes');

const MODULE_MODES = [MODULE_MODE_DEFAULT, MODULE_MODE_ALL_SINGLE, MODULE_MODE_ALL_MODULES];
const moduleModeArgIndex = process.argv.indexOf('--module-mode');
const MODULE_MODE = moduleModeArgIndex >= 0 ? process.argv[moduleModeArgIndex + 1] : MODULE_MODE_DEFAULT;
if (!MODULE_MODES.includes(MODULE_MODE)) {
  console.error(`--module-mode: unknown value ${JSON.stringify(MODULE_MODE)} (expected ${MODULE_MODES.join(' | ')})`);
  process.exit(1);
}
const EMIT_MODES = ['code', 'functions', 'both'];
const emitModeArgIndex = process.argv.indexOf('--emit-mode');
const EMIT_MODE = emitModeArgIndex >= 0 ? process.argv[emitModeArgIndex + 1] : 'both';
if (!EMIT_MODES.includes(EMIT_MODE)) {
  console.error(`--emit-mode: unknown value ${JSON.stringify(EMIT_MODE)} (expected ${EMIT_MODES.join(' | ')})`);
  process.exit(1);
}
const INLINE_MODES = ['default', 'allInternal'];
const inlineModeArgIndex = process.argv.indexOf('--inline-mode');
const INLINE_MODE = inlineModeArgIndex >= 0 ? process.argv[inlineModeArgIndex + 1] : undefined;
if (INLINE_MODE !== undefined && !INLINE_MODES.includes(INLINE_MODE)) {
  console.error(`--inline-mode: unknown value ${JSON.stringify(INLINE_MODE)} (expected ${INLINE_MODES.join(' | ')})`);
  process.exit(1);
}

// Default keeps the familiar logs/build/; other module modes get their own dir
// so the layouts can be inspected side by side. Non-default emit modes get an
// `-<emitMode>` suffix (e.g. logs/build-code, logs/build-functions) so the
// code/factory variants are diffable for size comparison.
const MODE_DIR = MODULE_MODE === MODULE_MODE_DEFAULT ? 'logs/build' : `logs/build-${MODULE_MODE}`;
const EMIT_DIR = EMIT_MODE === 'both' ? MODE_DIR : `${MODE_DIR}-${EMIT_MODE}`;
const OUT_DIR = path.join(REPO_ROOT, !INLINE_MODE || INLINE_MODE === 'default' ? EMIT_DIR : `${EMIT_DIR}-${INLINE_MODE}`);
const VIRTUAL_DIR = path.join(OUT_DIR, 'virtual-rt');

// Collect every fixture .ts under test/suites/, skipping the .test.ts
// counterparts (those are the runners, not the marker call sites — they
// rarely contain createX themselves; fixtures own the calls).
function listFixtures(root) {
  const out = [];
  for (const entry of fs.readdirSync(root, {withFileTypes: true})) {
    const abs = path.join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...listFixtures(abs));
    } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(abs);
    }
  }
  return out;
}

async function main() {
  if (!fs.existsSync(BIN)) {
    console.error(`ts-runtypes binary not built: ${BIN}`);
    console.error('Run: go build -o bin/ts-runtypes ./cmd/ts-runtypes');
    process.exit(1);
  }

  fs.rmSync(OUT_DIR, {recursive: true, force: true});
  fs.mkdirSync(OUT_DIR, {recursive: true});
  fs.mkdirSync(VIRTUAL_DIR, {recursive: true});

  // Spawn the binary in --one-shot mode against the tsconfig so the Program
  // is built once at startup from disk (no setSources handshake needed —
  // every fixture is already on the filesystem). emitMode 'both' (the default
  // here) mirrors the marker package's own vitest config so the inline
  // createRTFn closure is part of the snapshot; `--emit-mode code` /
  // `--emit-mode functions` snapshot the other variants for size comparison.
  const resolver = new ResolverClient(BIN, MARKER_PKG, 'tsconfig.test.json', {
    emitMode: EMIT_MODE,
    moduleMode: MODULE_MODE,
    ...(INLINE_MODE ? {inlineMode: INLINE_MODE} : {}),
  });
  // Surface child stderr so resolver build/scan errors aren't silent.
  // ResolverClient buffers stdout JSON; stderr leaks under us. The
  // spawn API on the client doesn't expose the child handle, so we
  // wrap a process.exit on any unhandled rejection instead.
  process.on('unhandledRejection', (err) => {
    console.error('resolver error:', err);
    resolver.close();
    process.exit(1);
  });

  const fixtures = listFixtures(SUITES_ROOT);
  let rewriteCount = 0;
  let skipCount = 0;

  for (const abs of fixtures) {
    const rel = path.relative(MARKER_PKG, abs);
    const code = fs.readFileSync(abs, 'utf8');
    const result = await rewrite(rel, code, resolver);
    if (result.sites.length === 0 && result.replacements.length === 0) {
      skipCount++;
      continue;
    }
    const outFile = path.join(OUT_DIR, rel).replace(/\.ts$/, '.js');
    fs.mkdirSync(path.dirname(outFile), {recursive: true});
    fs.writeFileSync(outFile, result.code);
    rewriteCount++;
  }

  // After every fixture has been scanned, dump pulls back the full
  // session — every demanded entry module across all suites.
  const dump = await resolver.dump();
  const entries = dump.entryModules ?? {};
  // Pure-fn entry basenames carry their namespace as path segments
  // (e.g. `pf/rt/asJSONString`), so mkdir-p the parent before writing.
  for (const [basename, source] of Object.entries(entries)) {
    const target = path.join(VIRTUAL_DIR, `${basename}.js`);
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.writeFileSync(target, source);
  }

  resolver.close();
  const relOut = path.relative(REPO_ROOT, OUT_DIR);
  console.log(
    `dump-test-modules[${MODULE_MODE}]: ${rewriteCount} fixture${rewriteCount === 1 ? '' : 's'} rewritten ` +
      `(${skipCount} skipped, no marker calls), ${Object.keys(entries).length} virtual module${
        Object.keys(entries).length === 1 ? '' : 's'
      } emitted under ${relOut}/`
  );
}

main();
