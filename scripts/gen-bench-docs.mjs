#!/usr/bin/env node
// Transforms the benchmark harness output into website-consumable JSON under
// website/public/bench-data/<bench>/:
//
//   index.json              — { bench, label, unit, metricLabel, competitors[],
//                              sections: [{ key, label, cases: [{ key, title,
//                              results: { [competitor]: { validateOpsSec?, status? } } }] }] }
//   <case>.json             — { competitors: [{ name, source }] }   (lazy hover)
//
// Two benches:
//   validation — runtime throughput from benchmarks/results/<competitor>.json
//                (the validationErrors·accept path: the metric EVERY competitor
//                implements, so it's the apples-to-apples column; zod has no cheap
//                boolean validate). unit = ops/sec, higher is better.
//   typecost   — TypeScript type-instantiation count per form from
//                benchmarks/results/<form>.typecost.json. unit = count, LOWER is
//                better.
//
// Per-case competitor source is lifted straight from each competitors/<lib>/cases.ts
// object literal (balanced-delimiter scan, no TS dep) so the hover shows the real
// schema/validator each library authors for that case.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import ts from 'typescript';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const BENCH_DIR = path.join(REPO_ROOT, 'benchmarks');
const RESULTS_DIR = process.env.BENCH_RESULTS_DIR ?? path.join(BENCH_DIR, 'results');
const COMPETITORS_DIR = path.join(BENCH_DIR, 'competitors');
const OUT_ROOT = path.join(REPO_ROOT, 'website/public/bench-data');

// Stable competitor column order (mirrors aggregate.mjs PREFERRED).
const PREFERRED = ['ts-go-run-types', 'zod', 'typebox', 'ajv', 'typia'];
const order = (a, b) => ((PREFERRED.indexOf(a) + 1 || 99) - (PREFERRED.indexOf(b) + 1 || 99)) || a.localeCompare(b);

function sectionLabel(group) {
  return group
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function safeKey(key) {
  return String(key).replace(/[^A-Za-z0-9_.-]/g, '_');
}

// ── competitor source extraction ────────────────────────────────────────────
// Parse `export const cases … = { 'KEY': <expr>, … }` with the TypeScript
// compiler API and return a Map(caseKey → source text of <expr>). The AST parse
// is robust against regex literals, template `${}`, comments and nesting that
// trip a hand-rolled char scanner.
export function extractCaseSources(file) {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let obj = null;
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === 'cases' && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
        obj = decl.initializer;
      }
    }
  }
  if (!obj) return out;
  for (const prop of obj.properties) {
    if (!ts.isPropertyAssignment(prop)) continue;
    const name = prop.name;
    const key = ts.isStringLiteralLike(name) ? name.text : ts.isIdentifier(name) ? name.text : null;
    if (key == null) continue;
    out.set(key, prop.initializer.getText(sf).trim());
  }
  return out;
}

// ── runtime (validation) bench ───────────────────────────────────────────────
function buildValidationBench() {
  const files = fs.existsSync(RESULTS_DIR)
    ? fs.readdirSync(RESULTS_DIR).filter((f) => f.endsWith('.json') && !f.endsWith('.typecost.json'))
    : [];
  if (files.length === 0) {
    process.stderr.write(`skip validation bench: no results/*.json in ${RESULTS_DIR} (run \`pnpm run bench\` first)\n`);
    return 0;
  }
  const results = files.map((f) => JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf8')));
  const competitors = results.map((r) => r.competitor).sort(order);
  const byComp = new Map(results.map((r) => [r.competitor, new Map(r.cases.map((c) => [c.key, c]))]));
  // case list = the longest competitor's cases (preserves suite/group/name order).
  const rows = results.reduce((longest, r) => (r.cases.length > longest.length ? r.cases : longest), []);

  // group sources per competitor once
  const sources = new Map();
  for (const comp of competitors) sources.set(comp, extractCaseSources(path.join(COMPETITORS_DIR, comp, 'cases.ts')));

  const sectionMap = new Map(); // group → {key,label,cases[]}
  const outDir = path.join(OUT_ROOT, 'validation');
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});

  for (const row of rows) {
    const group = row.group;
    if (!sectionMap.has(group)) sectionMap.set(group, {key: group, label: sectionLabel(group), cases: []});
    const resultsForCase = {};
    const detailComps = [];
    for (const comp of competitors) {
      const c = byComp.get(comp)?.get(row.key);
      // validationErrors·accept — the universal apples-to-apples metric.
      const m = c?.validationErrors;
      if (m) resultsForCase[comp] = {validateOpsSec: m.validOpsSec, status: m.status};
      const source = sources.get(comp)?.get(row.key);
      if (source) detailComps.push({name: comp, source});
    }
    sectionMap.get(group).cases.push({key: safeKey(row.key), title: row.name, results: resultsForCase});
    fs.writeFileSync(path.join(outDir, `${safeKey(row.key)}.json`), JSON.stringify({competitors: detailComps}));
  }

  const index = {
    bench: 'validation',
    label: 'Validation',
    unit: 'ops',
    metricLabel: 'validationErrors · accept (ops/sec, higher is better)',
    competitors,
    sections: [...sectionMap.values()],
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  return rows.length;
}

if (process.argv[1] && process.argv[1].endsWith('gen-bench-docs.mjs')) {
  const did = buildValidationBench();
  process.stdout.write(`validation bench: ${did} cases → website/public/bench-data/validation/\n`);
}
