// Full validation + format-validation benchmark runner.
//
// Every case from both real suites runs against ts-go-run-types and the
// competitors (zod / typebox / ajv). A library that can't express a case's type
// is "not supported" (—) and skipped. Correctness is checked for every
// supported validator (valid samples pass, invalid fail); throughput is then
// measured. Exits non-zero if any SUPPORTED validator is incorrect.
//
// Env knobs:
//   BENCH_NO_TIMING=1   correctness only (fast; skips throughput)
//   BENCH_TIME_MS=100   per-cell measurement window

import {performance} from 'node:perf_hooks';
// Ensure ts-go-run-types' built-in format patterns are registered (the
// side-effect import the suites rely on, kept from being tree-shaken).
import '@mionjs/ts-go-run-types/formats';
import {VALIDATION_CASES, FORMAT_CASES, REALWORLD_CASES, type FlatCase} from './suites/adapter.ts';
import {NOT_SUPPORTED, type CompetitorMap, type ValidatorOrUnsupported} from './types.ts';
import {zodMap} from './competitors/zod.ts';
import {typeboxMap} from './competitors/typebox.ts';
import {ajvMap} from './competitors/ajv.ts';

const TIME_MS = Number(process.env.BENCH_TIME_MS ?? 100);
const NO_TIMING = process.env.BENCH_NO_TIMING === '1';

interface Lib {
  name: string;
  get: (c: FlatCase) => ValidatorOrUnsupported;
}

const competitor = (map: CompetitorMap) => (c: FlatCase) => map[c.key] ?? NOT_SUPPORTED;

const LIBS: Lib[] = [
  {name: 'ts-go-run-types', get: (c) => c.tsValidate},
  {name: 'zod', get: competitor(zodMap)},
  {name: 'typebox', get: competitor(typeboxMap)},
  {name: 'ajv', get: competitor(ajvMap)},
];

interface Cell {
  status: 'ok' | 'FAIL' | 'n/a';
  opsSec: number;
  detail?: string;
}

function check(v: (x: unknown) => boolean, samples: unknown[], want: boolean): number {
  // returns index of first mismatch, or -1 if all match
  for (let i = 0; i < samples.length; i++) {
    let r: boolean;
    try {
      r = v(samples[i]) === true;
    } catch {
      r = false; // a thrown validator is treated as "rejects"
    }
    if (r !== want) return i;
  }
  return -1;
}

function benchOps(v: (x: unknown) => boolean, samples: unknown[]): number {
  if (samples.length === 0) return 0;
  for (let i = 0; i < 1000; i++) for (const s of samples) safe(v, s);
  let batches = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < TIME_MS) {
    for (const s of samples) safe(v, s);
    batches++;
  }
  return (batches * samples.length) / ((performance.now() - t0) / 1000);
}

function safe(v: (x: unknown) => boolean, s: unknown): boolean {
  try {
    return v(s);
  } catch {
    return false;
  }
}

function evaluate(vu: ValidatorOrUnsupported, c: FlatCase): Cell {
  if (vu === NOT_SUPPORTED) return {status: 'n/a', opsSec: 0};
  const v = vu;
  const badValid = check(v, c.samples.valid, true);
  if (badValid >= 0) return {status: 'FAIL', opsSec: 0, detail: `valid[${badValid}] rejected`};
  const badInvalid = check(v, c.samples.invalid, false);
  if (badInvalid >= 0) return {status: 'FAIL', opsSec: 0, detail: `invalid[${badInvalid}] accepted`};
  const all = [...c.samples.valid, ...c.samples.invalid];
  return {status: 'ok', opsSec: NO_TIMING ? 0 : benchOps(v, all)};
}

const fmt = (n: number) =>
  n <= 0 ? '' : n >= 1e6 ? `${(n / 1e6).toFixed(0)}M/s` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k/s` : `${n.toFixed(0)}/s`;
const padR = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
const padL = (s: string, n: number) => s.padStart(n);

const COL = 16;
const KEYW = 30;

function section(title: string, cases: FlatCase[], stats: Stats): void {
  console.log(`\n### ${title}`);
  console.log(padR('case', KEYW) + LIBS.map((l) => padL(l.name, COL)).join(''));
  console.log('-'.repeat(KEYW + COL * LIBS.length));
  let lastGroup = '';
  for (const c of cases) {
    if (c.group !== lastGroup) {
      console.log(`· ${c.group}`);
      lastGroup = c.group;
    }
    let row = padR('  ' + c.name, KEYW);
    for (const lib of LIBS) {
      const cell = evaluate(lib.get(c), c);
      stats.bump(lib.name, cell.status);
      if (cell.status === 'FAIL') {
        row += padL('FAIL', COL);
        stats.failures.push(`${lib.name} / ${c.key}: ${cell.detail}`);
      } else if (cell.status === 'n/a') {
        row += padL('—', COL);
      } else {
        row += padL(fmt(cell.opsSec) || 'ok', COL);
      }
    }
    console.log(row);
  }
}

class Stats {
  ok: Record<string, number> = {};
  na: Record<string, number> = {};
  fail: Record<string, number> = {};
  failures: string[] = [];
  bump(lib: string, s: 'ok' | 'FAIL' | 'n/a') {
    const t = s === 'ok' ? this.ok : s === 'FAIL' ? this.fail : this.na;
    t[lib] = (t[lib] ?? 0) + 1;
  }
}

function main(): number {
  const stats = new Stats();
  console.log(
    `\nFull validation + format-validation benchmark` +
      (NO_TIMING ? ' (correctness only)' : ' (validations/sec)'),
  );
  section('validation', VALIDATION_CASES, stats);
  section('format-validation', FORMAT_CASES, stats);
  section('real-world', REALWORLD_CASES, stats);

  const total = VALIDATION_CASES.length + FORMAT_CASES.length + REALWORLD_CASES.length;
  console.log(`\nCoverage (supported / ${total} cases):`);
  for (const lib of LIBS) {
    const ok = stats.ok[lib.name] ?? 0;
    const fail = stats.fail[lib.name] ?? 0;
    console.log(
      `  ${padR(lib.name, 18)} ok=${ok}  fail=${fail}  not-supported=${stats.na[lib.name] ?? 0}`,
    );
  }

  if (stats.failures.length) {
    console.log(`\n✗ ${stats.failures.length} incorrect validator(s):`);
    for (const f of stats.failures.slice(0, 60)) console.log(`  ${f}`);
    return 1;
  }
  console.log('\n✓ every supported validator passed correctness for all cases.');
  return 0;
}

process.exit(main());
