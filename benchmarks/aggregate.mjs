// Reads every results/<name>.json (written by each competitor's isolated run),
// joins by case key, and renders the comparison tables + coverage. The benchmark
// now measures the ACCEPT (valid) path and the REJECT (invalid) path SEPARATELY,
// so this prints ONE table per path (they exercise different validator code and
// usually have very different throughput). A trailing "*" on a cell means that
// competitor used its OWN samples for the case (overrode the shared data).
// Exits non-zero if ANY competitor has a fail/errored case. Plain .mjs — no
// build; run after the per-competitor dists.

import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = process.env.BENCH_RESULTS_DIR ?? path.resolve(process.cwd(), 'results');
const PREFERRED = ['ts-go-run-types', 'zod', 'typebox', 'ajv', 'typia'];

const COL = 16;
const KEYW = 30;
const padR = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const padL = (s, n) => s.padStart(n);
const fmt = (n) => (n <= 0 ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M/s` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k/s` : `${n.toFixed(0)}/s`);

// `field` selects which path we render: 'validOpsSec' (accept) or 'invalidOpsSec' (reject).
function cell(c, field) {
  if (!c || c.status === 'not-supported') return '—';
  if (c.status === 'fail') return 'FAIL';
  if (c.status === 'errored') return 'ERROR';
  const star = c.samplesOverridden ? '*' : '';
  return (fmt(c[field]) || 'ok') + star;
}

function load() {
  let files;
  try {
    files = readdirSync(RESULTS_DIR);
  } catch {
    return [];
  }
  return files
    .filter((f) => f.endsWith('.json') && !f.endsWith('.typecost.json'))
    .map((f) => JSON.parse(readFileSync(path.join(RESULTS_DIR, f), 'utf8')));
}

// Render one path's per-suite tables across all competitors.
function renderPath(title, field, competitors, byKey, rows) {
  console.log(`\n══════ ${title} ══════`);
  let lastSuite = '';
  let lastGroup = '';
  for (const row of rows) {
    if (row.suite !== lastSuite) {
      lastSuite = row.suite;
      lastGroup = '';
      console.log(`\n### ${row.suite}`);
      console.log(padR('case', KEYW) + competitors.map((c) => padL(c, COL)).join(''));
      console.log('-'.repeat(KEYW + COL * competitors.length));
    }
    if (row.group !== lastGroup) {
      lastGroup = row.group;
      console.log(`· ${row.group}`);
    }
    let line = padR('  ' + row.name, KEYW);
    for (const name of competitors) line += padL(cell(byKey.get(name).get(row.key), field), COL);
    console.log(line);
  }
}

function main() {
  const results = load();
  if (results.length === 0) {
    console.error(`aggregate: no results/*.json in ${RESULTS_DIR} — run the competitors first.`);
    return 1;
  }
  const order = (a, b) => ((PREFERRED.indexOf(a) + 1 || 99) - (PREFERRED.indexOf(b) + 1 || 99)) || a.localeCompare(b);
  const competitors = results.map((r) => r.competitor).sort(order);
  const byKey = new Map(results.map((r) => [r.competitor, new Map(r.cases.map((c) => [c.key, c]))]));
  const rows = results.reduce((longest, r) => (r.cases.length > longest.length ? r.cases : longest), []);

  const noTiming = results[0].env.noTiming;
  console.log(`\nFull validation benchmark${noTiming ? ' (correctness only)' : ' — accept vs reject paths'}`);
  console.log('cells are validations/sec; "*" = competitor used its own samples (overrode shared data).');

  // Two passes: the accept (valid) path, then the reject (invalid) path.
  renderPath(noTiming ? 'VALID PATH (accept)' : 'VALID PATH — accepts/sec', 'validOpsSec', competitors, byKey, rows);
  renderPath(noTiming ? 'INVALID PATH (reject)' : 'INVALID PATH — rejects/sec', 'invalidOpsSec', competitors, byKey, rows);

  console.log('\nCoverage:');
  let failed = 0;
  for (const name of competitors) {
    const r = results.find((x) => x.competitor === name);
    const s = r.summary;
    failed += s.fail + s.errored;
    const err = s.errored ? `  errored=${s.errored}` : '';
    const over = r.cases.filter((c) => c.samplesOverridden).length;
    const overStr = over ? `  overrides=${over}` : '';
    console.log(`  ${padR(name, 18)} ok=${s.ok}  fail=${s.fail}${err}  not-supported=${s.notSupported}${overStr}  / ${s.total}`);
  }

  if (failed > 0) {
    console.log(`\n✗ ${failed} fail/errored case(s) across competitors:`);
    for (const r of results) {
      for (const c of r.cases) {
        if (c.status === 'fail' || c.status === 'errored') console.log(`  ${r.competitor} / ${c.key}: ${c.status}${c.detail ? ` — ${c.detail}` : ''}`);
      }
    }
    return 1;
  }
  console.log('\n✓ every supported validator passed correctness on BOTH paths for all cases.');
  return 0;
}

process.exit(main());
