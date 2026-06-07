// Reads every results/<name>.json (written by each competitor's isolated run),
// joins by case key, and renders the comparison table + coverage. Replaces the
// old single-process run.ts presentation. Exits non-zero if ANY competitor has a
// fail/errored case. Plain .mjs — no build, run after the per-competitor dists.

import {readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

const RESULTS_DIR = process.env.BENCH_RESULTS_DIR ?? path.resolve(process.cwd(), 'results');
const PREFERRED = ['ts-go-run-types', 'zod', 'typebox', 'ajv', 'typia'];

const COL = 16;
const KEYW = 30;
const padR = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const padL = (s, n) => s.padStart(n);
const fmt = (n) => (n <= 0 ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M/s` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k/s` : `${n.toFixed(0)}/s`);

function cell(c) {
  if (!c || c.status === 'not-supported') return '—';
  if (c.status === 'fail') return 'FAIL';
  if (c.status === 'errored') return 'ERROR';
  return fmt(c.opsSec) || 'ok';
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

  console.log(`\nFull validation benchmark${results[0].env.noTiming ? ' (correctness only)' : ' (validations/sec)'}`);
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
    for (const name of competitors) line += padL(cell(byKey.get(name).get(row.key)), COL);
    console.log(line);
  }

  console.log('\nCoverage:');
  let failed = 0;
  for (const name of competitors) {
    const s = results.find((r) => r.competitor === name).summary;
    failed += s.fail + s.errored;
    const err = s.errored ? `  errored=${s.errored}` : '';
    console.log(`  ${padR(name, 18)} ok=${s.ok}  fail=${s.fail}${err}  not-supported=${s.notSupported}  / ${s.total}`);
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
  console.log('\n✓ every supported validator passed correctness for all cases.');
  return 0;
}

process.exit(main());
