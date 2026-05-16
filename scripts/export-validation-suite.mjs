#!/usr/bin/env node
// Generates docs/validation-suite.json from VALIDATION_SUITE.
//
// Pipeline:
//   1. Spawn `go run ./cmd/extract-fn-bodies` to lift the original TS source
//      text of every arrow-function body inside VALIDATION_SUITE.
//   2. Load the suite through vite's ssrLoadModule (configured with the
//      `source` resolve condition so the marker package resolves to its
//      in-tree `src/`). Going through vite — not Node's native
//      --experimental-strip-types — handles the suite's in-thunk `enum`
//      declarations, which Node's strip-only mode rejects.
//   3. Walk the runtime suite; for each case, copy non-function fields
//      verbatim and substitute Go-extracted source for each function field.
//   4. Write the merged tree to docs/validation-suite.json.
//
// Future extensions — perf measurement, evaluated sample arrays, validator
// cross-checks — land here in the Node side without touching the Go cmd.

import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import {createServer} from 'vite';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const SUITE_PATH = path.join(REPO_ROOT, 'packages/ts-go-run-types/test/suites/validation-suite.ts');
const OUT_PATH = path.join(REPO_ROOT, 'gendocs/validation-suite.json');
const IDENTIFIER = 'VALIDATION_SUITE';
const FN_FIELDS = ['isType', 'isTypeReflect', 'getSamples'];

function runGoExtractor() {
  const res = spawnSync('go', ['run', './cmd/extract-fn-bodies', '--file', SUITE_PATH, '--identifier', IDENTIFIER], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  if (res.error) {
    process.stderr.write(`go run failed to launch: ${res.error.message}\n`);
    process.exit(1);
  }
  if (res.status !== 0) {
    process.stderr.write(res.stderr || '');
    process.exit(res.status || 1);
  }
  return JSON.parse(res.stdout);
}

async function loadSuite() {
  const server = await createServer({
    root: REPO_ROOT,
    configFile: false,
    server: {middlewareMode: true},
    appType: 'custom',
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    optimizeDeps: {noDiscovery: true},
    logLevel: 'error',
  });
  try {
    const mod = await server.ssrLoadModule(SUITE_PATH);
    return mod.VALIDATION_SUITE;
  } finally {
    await server.close();
  }
}

function buildOutput(suite, bodies) {
  const out = {};
  let totalCategories = 0;
  let totalCases = 0;
  let totalBodies = 0;
  for (const [category, cases] of Object.entries(suite)) {
    out[category] = {};
    totalCategories += 1;
    for (const [caseKey, caseObj] of Object.entries(cases)) {
      totalCases += 1;
      const record = {};
      if (typeof caseObj.title === 'string') record.title = caseObj.title;
      if (typeof caseObj.description === 'string') record.description = caseObj.description;
      if (caseObj.isTypeNotes !== undefined) record.isTypeNotes = caseObj.isTypeNotes;
      for (const fnField of FN_FIELDS) {
        if (typeof caseObj[fnField] !== 'function') continue;
        const body = bodies?.[category]?.[caseKey]?.[fnField];
        if (typeof body !== 'string') {
          throw new Error(`missing extracted body for ${category}.${caseKey}.${fnField}`);
        }
        record[fnField] = body;
        totalBodies += 1;
      }
      out[category][caseKey] = record;
    }
  }
  return {out, totalCategories, totalCases, totalBodies};
}

async function main() {
  const bodies = runGoExtractor();
  const suite = await loadSuite();
  const {out, totalCategories, totalCases, totalBodies} = buildOutput(suite, bodies);
  fs.mkdirSync(path.dirname(OUT_PATH), {recursive: true});
  fs.writeFileSync(OUT_PATH, JSON.stringify(out, null, 2) + '\n');
  process.stdout.write(
    `wrote ${path.relative(REPO_ROOT, OUT_PATH)} — ${totalCategories} categories, ${totalCases} cases, ${totalBodies} function bodies\n`
  );
}

await main();
