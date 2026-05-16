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
  // Strip every cache-source field off each response so the JSON view
  // stays compact and the caches render as readable JS at the bottom of
  // the file. Any field whose name ends in "CacheSource" is treated as
  // a cache body — that covers the protocol's runTypeCacheSource,
  // isTypeCacheSource, and parsedFnsCacheSource (and any future
  // sibling that follows the same naming convention).
  const responses = meta.responses ?? [];
  const stripped = responses.map(stripCacheSources);
  // caches[i] is a {fieldName -> body} record for response i, holding
  // only the non-empty cache-source bodies.
  const caches = responses.map(collectCacheSources);

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

  // One "// === <fieldName> ===" block per non-empty cache-source body,
  // tagged by response index when there's more than one response.
  const responseCount = caches.length;
  caches.forEach((perResponse, responseIdx) => {
    for (const [fieldName, body] of Object.entries(perResponse)) {
      const label = responseCount > 1 ? `${fieldName} [${responseIdx}]` : fieldName;
      parts.push(`// === ${label} ===`);
      parts.push(body.endsWith('\n') ? body.slice(0, -1) : body);
      parts.push('');
    }
  });
  return parts.join('\n');
}

// isCacheSourceField reports whether a daemon-response field carries a
// rendered virtual-module body. Every cache kind names its field
// "<kind>CacheSource", so a suffix check covers the whole family
// without enumerating each one — new kinds light up automatically.
function isCacheSourceField(name) {
  return typeof name === 'string' && name.endsWith('CacheSource');
}

function stripCacheSources(response) {
  if (!response || typeof response !== 'object') return response;
  const out = {};
  for (const [key, value] of Object.entries(response)) {
    if (isCacheSourceField(key)) continue;
    out[key] = value;
  }
  return out;
}

function collectCacheSources(response) {
  const out = {};
  if (!response || typeof response !== 'object') return out;
  for (const [key, value] of Object.entries(response)) {
    if (!isCacheSourceField(key)) continue;
    if (typeof value !== 'string' || value.length === 0) continue;
    out[key] = value;
  }
  return out;
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
