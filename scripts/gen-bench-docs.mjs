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

// Project one harness MetricResult onto the docs shape: valid (accept), invalid
// (reject), and mixed (interleaved) ops/sec. `mixed` uses the harness's measured
// `mixedOpsSec` when present; older result files predate it, so we derive it as
// the harmonic mean of valid + invalid — the exact throughput of a 1:1
// interleaved stream (modulo branch-prediction effects a real run also captures).
function toMetric(m) {
  let mixed = typeof m.mixedOpsSec === 'number' && m.mixedOpsSec > 0 ? m.mixedOpsSec : 0;
  if (mixed === 0 && m.validOpsSec > 0 && m.invalidOpsSec > 0) {
    mixed = 2 / (1 / m.validOpsSec + 1 / m.invalidOpsSec);
  }
  return {valid: m.validOpsSec, invalid: m.invalidOpsSec, mixed, status: m.status};
}

// ── competitor source extraction ────────────────────────────────────────────
// Parse `export const cases … = { 'KEY': <expr>, … }` with the TypeScript
// compiler API and return a Map(caseKey → source text of <expr>). The AST parse
// is robust against regex literals, template `${}`, comments and nesting that
// trip a hand-rolled char scanner.
export function extractCaseSources(file, varName = 'cases') {
  const out = new Map();
  if (!fs.existsSync(file)) return out;
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let obj = null;
  for (const stmt of sf.statements) {
    if (!ts.isVariableStatement(stmt)) continue;
    for (const decl of stmt.declarationList.declarations) {
      if (ts.isIdentifier(decl.name) && decl.name.text === varName && decl.initializer && ts.isObjectLiteralExpression(decl.initializer)) {
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
      // Emit BOTH metrics × BOTH paths so the docs can show them split: the cheap
      // boolean `validate` is-valid check AND the full `validationErrors` report,
      // each on valid (accept) and invalid (reject) input. Conflating them hides
      // that libraries with a fast boolean path (ts-run-types, typebox) pay extra
      // for error reporting, while ajv/zod always compute errors.
      const metricResult = {};
      if (c?.validate) metricResult.validate = toMetric(c.validate);
      if (c?.validationErrors) metricResult.validationErrors = toMetric(c.validationErrors);
      if (Object.keys(metricResult).length > 0) resultsForCase[comp] = metricResult;
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
    showInvalid: true,
    metrics: [
      {key: 'validate', label: 'Is-valid', metricLabel: 'createValidate — boolean is-valid check (ops/sec, higher is better)'},
      {key: 'validationErrors', label: 'Validation errors', metricLabel: 'getValidationErrors — full error report (ops/sec, higher is better)'},
    ],
    competitors,
    sections: [...sectionMap.values()],
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  return rows.length;
}

// ── typecost bench ───────────────────────────────────────────────────────────
// Forms (not runtime competitors): each measures TypeScript type-instantiation
// count per case (lower is better). Source for the hover comes from each form's
// authoring file. No ajv — JSON Schema has no static type inference.
const TYPECOST_FORMS = [
  {id: 'ts-go-run-types-type', label: 'ts-run-types (type)', srcFile: 'ts-go-run-types/cases.ts', srcVar: 'cases'},
  {id: 'ts-go-run-types-schema', label: 'ts-run-types (schema)', srcFile: 'ts-go-run-types/schemaCases.ts', srcVar: 'schemaCases'},
  {id: 'typia', label: 'typia', srcFile: 'typia/cases.ts', srcVar: 'cases'},
  {id: 'typebox', label: 'typebox', srcFile: 'typebox/cases.ts', srcVar: 'cases'},
  {id: 'zod', label: 'zod', srcFile: 'zod/cases.ts', srcVar: 'cases'},
];

function buildTypecostBench() {
  const byForm = new Map(); // id → Map(key → instantiations)
  const meta = new Map(); // key → {group, name}
  const orderedKeys = [];
  for (const form of TYPECOST_FORMS) {
    const file = path.join(RESULTS_DIR, `${form.id}.typecost.json`);
    if (!fs.existsSync(file)) {
      byForm.set(form.id, new Map());
      continue;
    }
    const d = JSON.parse(fs.readFileSync(file, 'utf8'));
    const m = new Map();
    for (const c of d.cases) {
      m.set(c.key, c.instantiations);
      if (!meta.has(c.key)) {
        meta.set(c.key, {group: c.group, name: c.name});
        orderedKeys.push(c.key);
      }
    }
    byForm.set(form.id, m);
  }
  if (orderedKeys.length === 0) {
    process.stderr.write(`skip typecost bench: no results/*.typecost.json in ${RESULTS_DIR} (run \`pnpm run bench:typecost\`)\n`);
    return 0;
  }

  const forms = TYPECOST_FORMS.filter((f) => byForm.get(f.id)?.size);
  const sources = new Map(forms.map((f) => [f.id, extractCaseSources(path.join(COMPETITORS_DIR, f.srcFile), f.srcVar)]));

  const outDir = path.join(OUT_ROOT, 'typecost');
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});

  const sectionMap = new Map();
  for (const key of orderedKeys) {
    const {group, name} = meta.get(key);
    if (!sectionMap.has(group)) sectionMap.set(group, {key: group, label: sectionLabel(group), cases: []});
    const results = {};
    const detailComps = [];
    for (const form of forms) {
      const inst = byForm.get(form.id).get(key);
      // Single metric, single path — typecost has no valid/invalid split.
      if (inst !== undefined) results[form.label] = {typecost: {valid: inst, status: 'ok'}};
      const source = sources.get(form.id)?.get(key);
      if (source) detailComps.push({name: form.label, source});
    }
    sectionMap.get(group).cases.push({key: safeKey(key), title: name, results});
    fs.writeFileSync(path.join(outDir, `${safeKey(key)}.json`), JSON.stringify({competitors: detailComps}));
  }

  const index = {
    bench: 'typecost',
    label: 'Type Cost',
    unit: 'count',
    showInvalid: false,
    metrics: [{key: 'typecost', label: 'Type cost', metricLabel: 'TypeScript type instantiations — lower is better'}],
    competitors: forms.map((f) => f.label),
    sections: [...sectionMap.values()],
  };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  return orderedKeys.length;
}

if (process.argv[1] && process.argv[1].endsWith('gen-bench-docs.mjs')) {
  const v = buildValidationBench();
  process.stdout.write(`validation bench: ${v} cases → website/public/bench-data/validation/\n`);
  const t = buildTypecostBench();
  process.stdout.write(`typecost bench: ${t} cases → website/public/bench-data/typecost/\n`);
}
