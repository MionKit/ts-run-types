import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Vitest reporter that mirrors `runTest` / `runFiles` invocations to disk.
// Activated via `pnpm test:logs` (which stacks `--reporter=default` for the
// normal console output and `--reporter=./scripts/runtypes-logs-reporter.mjs`
// for the side-effect). The helpers in
// packages/vite-plugin-runtypes/test/helpers/inline.ts attach
// `task.meta.mionRunTypes = {title, sources, mode, responses}`; this
// reporter walks the task tree on completion and emits one .ts file PER
// CACHE per test under a three-level layout — bucketed by source test
// file, then by test title, then split per cache kind:
//   logs/<testFile>/<titleSlug>/daemon.ts        — daemon response with
//                                                  every *CacheSource
//                                                  field stripped (plus
//                                                  the input sources).
//   logs/<testFile>/<titleSlug>/<cacheKind>.ts   — one file per non-empty
//                                                  *CacheSource field on
//                                                  the response;
//                                                  cacheKind is the field
//                                                  name minus the
//                                                  "CacheSource" suffix
//                                                  (e.g. runType, validate,
//                                                  validationErrors, pureFns).
// Every file repeats the input sources at the top so it's self-contained
// when opened in isolation.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const LOGS_DIR = path.join(REPO_ROOT, 'logs');
const DTS_KEY = 'runtypes.d.ts';

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'unnamed'
  );
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

// renderSourcesHeader returns the input sources as a series of
// "// === <name> ===" blocks. Shared across every emitted file so each
// log file is self-contained.
function renderSourcesHeader(meta) {
  const parts = [];
  for (const [name, code] of Object.entries(meta.sources ?? {})) {
    if (name === DTS_KEY) continue;
    parts.push(`// === ${name} ===`);
    parts.push(code.endsWith('\n') ? code.slice(0, -1) : code);
    parts.push('');
  }
  return parts;
}

// renderDaemonFile builds the `<slug>.daemon.ts` body: input sources
// followed by the response(s) with every *CacheSource field stripped.
function renderDaemonFile(meta) {
  const parts = renderSourcesHeader(meta);
  const responses = meta.responses ?? [];
  const stripped = responses.map(stripCacheSources);
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
  return parts.join('\n');
}

// renderCacheFile builds a single per-cache file body: input sources at
// the top so the file is self-contained, then a banner naming the cache
// (with response index when more than one response was recorded), then
// the rendered cache module body verbatim.
function renderCacheFile(meta, fieldName, body, responseIdx, responseCount) {
  const parts = renderSourcesHeader(meta);
  const label = responseCount > 1 ? `${fieldName} [${responseIdx}]` : fieldName;
  parts.push(`// === ${label} ===`);
  parts.push(body.endsWith('\n') ? body.slice(0, -1) : body);
  parts.push('');
  return parts.join('\n');
}

// isCacheSourceField reports whether a daemon-response field carries a
// rendered virtual-module body. Every cache kind names its field
// "<kind>CacheSource", so a suffix check covers the whole family
// without enumerating each one — new kinds light up automatically.
function isCacheSourceField(name) {
  return typeof name === 'string' && name.endsWith('CacheSource');
}

// cacheKindOf returns the short kind name used in output filenames —
// the field name minus its "CacheSource" suffix (e.g. "runTypeCacheSource"
// → "runType"). New cache kinds light up automatically as long as they
// follow the same naming convention.
function cacheKindOf(fieldName) {
  return fieldName.slice(0, -'CacheSource'.length);
}

function stripCacheSources(response) {
  if (!response || typeof response !== 'object') return response;
  const out = {};
  for (const [key, value] of Object.entries(response)) {
    if (isCacheSourceField(key)) continue;
    if (key === 'modules') continue; // module-mode per-entry sources — same bulk rationale
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

export default class RunTypesLogsReporter {
  onInit() {
    fs.rmSync(LOGS_DIR, {recursive: true, force: true});
    fs.mkdirSync(LOGS_DIR, {recursive: true});
    this.usedSlugs = new Set();
  }

  onFinished(files) {
    let written = 0;
    for (const task of walkTasks(files)) {
      const meta = task.meta?.mionRunTypes;
      if (!meta) continue;
      const filePath = task.file?.filepath ?? task.file?.name ?? 'unknown';
      const bucket = fileBasename(filePath);
      const titleSlug = slugify(meta.title);
      // Per-bucket de-dup so two tests in different test files can share a
      // title without colliding, while two tests in the same file with
      // matching titles still get unique filenames.
      const key = `${bucket}/${titleSlug}`;
      let slug = titleSlug;
      let i = 1;
      while (this.usedSlugs.has(`${bucket}/${slug}`)) slug = `${titleSlug}-${++i}`;
      this.usedSlugs.add(`${bucket}/${slug}`);

      const testDir = path.join(LOGS_DIR, bucket, slug);
      fs.mkdirSync(testDir, {recursive: true});

      // 1) daemon-response file (sources + response sans cache fields).
      fs.writeFileSync(path.join(testDir, 'daemon.ts'), renderDaemonFile(meta));
      written++;

      // 2) one file per non-empty cache-source body, per response.
      const responses = meta.responses ?? [];
      responses.forEach((response, responseIdx) => {
        const caches = collectCacheSources(response);
        for (const [fieldName, body] of Object.entries(caches)) {
          const kind = cacheKindOf(fieldName);
          // When more than one response, suffix the kind with the index
          // so the files don't collide.
          const basename = responses.length > 1 ? `${kind}.${responseIdx}` : kind;
          fs.writeFileSync(
            path.join(testDir, `${basename}.ts`),
            renderCacheFile(meta, fieldName, body, responseIdx, responses.length)
          );
          written++;
        }
      });
    }
    if (written > 0) {
      const rel = path.relative(REPO_ROOT, LOGS_DIR) || 'logs';
      console.log(`\nruntypes-logs-reporter: wrote ${written} log file(s) to ${rel}/`);
    }
  }
}
