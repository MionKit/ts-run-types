import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {CACHE_MODULES} from '../packages/vite-plugin-runtypes/dist/runtypes-constants.generated.js';

// Vitest reporter that mirrors `runTest` / `runFiles` invocations to disk.
// Activated via `pnpm test:logs` (which stacks `--reporter=default` for the
// normal console output and `--reporter=./scripts/runtypes-logs-reporter.mjs`
// for the side-effect). The helpers in
// packages/vite-plugin-runtypes/test/helpers/inline.ts attach
// `task.meta.mionRunTypes = {title, sources, mode, responses}`; this
// reporter walks the task tree on completion and emits one .ts file PER
// CACHE KIND per test under a three-level layout — bucketed by source test
// file, then by test title, then split per kind:
//   logs/<testFile>/<titleSlug>/daemon.ts        — daemon response with the
//                                                  entryModules map stripped
//                                                  (plus the input sources).
//   logs/<testFile>/<titleSlug>/<cacheKind>.ts   — the response's per-entry
//                                                  virtual modules grouped by
//                                                  cache kind (runType,
//                                                  validate, …, pureFns),
//                                                  one banner per module.
// The kind of each entry module is sniffed off its tuple's slot 0 (numeric
// for runtype / pure-fn / missing entries, the family tag string for fn
// entries); family tags map back to their CacheModules key via the generated
// constants mirror. Every file repeats the input sources at the top so it's
// self-contained when opened in isolation.

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
// followed by the response(s) with the entryModules map stripped.
function renderDaemonFile(meta) {
  const parts = renderSourcesHeader(meta);
  const responses = meta.responses ?? [];
  const stripped = responses.map(stripEntryModules);
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

// renderCacheFile builds a single per-kind file body: input sources at
// the top so the file is self-contained, then one banner + verbatim module
// source per entry module of that kind (with response index when more than
// one response was recorded).
function renderCacheFile(meta, kind, modules, responseIdx, responseCount) {
  const parts = renderSourcesHeader(meta);
  for (const [basename, body] of modules) {
    const label = responseCount > 1 ? `virtual:rt/${basename}.js [${responseIdx}]` : `virtual:rt/${basename}.js`;
    parts.push(`// === ${label} ===`);
    parts.push(body.endsWith('\n') ? body.slice(0, -1) : body);
    parts.push('');
  }
  void kind;
  return parts.join('\n');
}

// keyByFamilyTag inverts the generated CACHE_MODULES registry so an entry
// module's family tag ('val', 'verr', …) maps back to its readable kind name
// ('validate', 'validationErrors', …). JSON-composite tags (jeCL, jdST, …)
// have no CacheModules row and fall through to the tag itself.
const keyByFamilyTag = Object.fromEntries(Object.entries(CACHE_MODULES).map(([key, settings]) => [settings.tag, key]));

// entryKindOf sniffs an entry module's cache kind off its exported tuple's
// slot 0 — numeric (0 runtype / 2 pure fn / 3 missing stub) or the quoted
// family tag string for fn entries.
function entryKindOf(source) {
  const match = source.match(/export const e=\[(?:'([^']+)'|(\d+))[,\]]/);
  if (!match) return 'unknown';
  if (match[1] !== undefined) return keyByFamilyTag[match[1]] ?? match[1];
  return {0: 'runType', 2: 'pureFns', 3: 'missing'}[match[2]] ?? 'unknown';
}

function stripEntryModules(response) {
  if (!response || typeof response !== 'object') return response;
  const out = {};
  for (const [key, value] of Object.entries(response)) {
    if (key === 'entryModules') continue;
    out[key] = value;
  }
  return out;
}

// collectCacheGroups buckets a response's entry modules by cache kind,
// sorted by basename within each group for stable output.
function collectCacheGroups(response) {
  const groups = {};
  const entryModules = response?.entryModules;
  if (!entryModules || typeof entryModules !== 'object') return groups;
  for (const [basename, source] of Object.entries(entryModules)) {
    if (typeof source !== 'string' || source.length === 0) continue;
    const kind = entryKindOf(source);
    (groups[kind] ??= []).push([basename, source]);
  }
  for (const modules of Object.values(groups)) {
    modules.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  }
  return groups;
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

      // 2) one file per cache kind with that kind's entry modules, per
      // response.
      const responses = meta.responses ?? [];
      responses.forEach((response, responseIdx) => {
        const groups = collectCacheGroups(response);
        for (const [kind, modules] of Object.entries(groups)) {
          // When more than one response, suffix the kind with the index
          // so the files don't collide.
          const basename = responses.length > 1 ? `${kind}.${responseIdx}` : kind;
          fs.writeFileSync(path.join(testDir, `${basename}.ts`), renderCacheFile(meta, kind, modules, responseIdx, responses.length));
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
