import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Vitest reporter that mirrors `runTest` / `runFiles` invocations to disk.
// Activated via `pnpm test:logs` (which stacks `--reporter=default` for the
// normal console output and `--reporter=./scripts/runtypes-logs-reporter.mjs`
// for the side-effect). The helpers in
// packages/vite-plugin-runtypes/test/helpers/inline.ts attach
// `task.meta.mionRuntypes = {title, sources, mode, responses}`; this
// reporter walks the task tree on completion and emits one `.ts` file per
// test under <repo-root>/logs/ with the input sources at the top and the
// daemon response(s) appended as exported constants.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const LOGS_DIR = path.join(REPO_ROOT, 'logs');
const DTS_KEY = 'runtypes.d.ts';

function slugify(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'unnamed';
}

function fileBasename(filePath) {
  const base = path.basename(filePath);
  return base.replace(/\.test\.ts$/, '').replace(/\.spec\.ts$/, '') || base;
}

function* walkTasks(tasks) {
  for (const task of tasks ?? []) {
    if (task.type === 'suite') {
      yield* walkTasks(task.tasks);
    } else {
      yield task;
    }
  }
}

function renderBody(meta) {
  const parts = [];
  for (const [name, code] of Object.entries(meta.sources ?? {})) {
    if (name === DTS_KEY) continue;
    parts.push(`// === ${name} ===`);
    parts.push(code.endsWith('\n') ? code.slice(0, -1) : code);
    parts.push('');
  }
  // Split cacheSource off each response so the JSON view stays compact and
  // the cache renders as readable JS at the bottom of the file.
  const responses = meta.responses ?? [];
  const stripped = responses.map((r) => {
    if (r && typeof r === 'object' && 'cacheSource' in r) {
      const {cacheSource: _omit, ...rest} = r;
      return rest;
    }
    return r;
  });
  const caches = responses.map((r) => (r && typeof r === 'object' ? r.cacheSource : undefined));

  parts.push('// === daemon response ===');
  if (responses.length === 0) {
    parts.push('// (no evalCacheFor / scanFiles call recorded for this test)');
    parts.push('export const daemonResponse = null;');
  } else if (responses.length === 1) {
    parts.push(`export const daemonResponse = ${JSON.stringify(stripped[0], null, 2)};`);
  } else {
    parts.push(`export const daemonResponses = ${JSON.stringify(stripped, null, 2)};`);
  }
  parts.push('');

  const presentCaches = caches.filter((c) => typeof c === 'string' && c.length > 0);
  if (presentCaches.length === 1) {
    parts.push('// === cache source ===');
    parts.push(presentCaches[0].endsWith('\n') ? presentCaches[0].slice(0, -1) : presentCaches[0]);
    parts.push('');
  } else if (presentCaches.length > 1) {
    caches.forEach((cache, i) => {
      if (typeof cache !== 'string' || cache.length === 0) return;
      parts.push(`// === cache source [${i}] ===`);
      parts.push(cache.endsWith('\n') ? cache.slice(0, -1) : cache);
      parts.push('');
    });
  }
  return parts.join('\n');
}

export default class RuntypesLogsReporter {
  onInit() {
    fs.rmSync(LOGS_DIR, {recursive: true, force: true});
    fs.mkdirSync(LOGS_DIR, {recursive: true});
    this.usedNames = new Set();
  }

  onFinished(files) {
    let written = 0;
    for (const task of walkTasks(files)) {
      const meta = task.meta?.mionRuntypes;
      if (!meta) continue;
      const filePath = task.file?.filepath ?? task.file?.name ?? 'unknown';
      const baseSlug = `${fileBasename(filePath)}.${slugify(meta.title)}`;
      let name = baseSlug;
      let i = 1;
      while (this.usedNames.has(name)) name = `${baseSlug}-${++i}`;
      this.usedNames.add(name);
      fs.writeFileSync(path.join(LOGS_DIR, `${name}.ts`), renderBody(meta));
      written++;
    }
    if (written > 0) {
      const rel = path.relative(REPO_ROOT, LOGS_DIR) || 'logs';
      console.log(`\nruntypes-logs-reporter: wrote ${written} log file(s) to ${rel}/`);
    }
  }
}
