// Runner: executes every (bench, variant, profile[, consume]) combination in
// its own node process (IC/type-feedback isolation), collects the JSON lines,
// and prints grouped tables with speedups relative to the current
// implementation.
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const benchFile = join(here, 'bench.mjs');

const PROFILES = ['clean', 'dirty1', 'dirty5'];

const MATRIX = [
  // bench, variants(null = all), profiles, consume flags
  { bench: 'huk', profiles: PROFILES, consume: [0] },
  { bench: 'strip', profiles: PROFILES, consume: [0, 1] },
  { bench: 'flow', profiles: ['clean', 'dirty1'], consume: [0] },
];

const list = JSON.parse(
  spawnSync('node', [benchFile, 'list'], { encoding: 'utf8' }).stdout.trim(),
);

const jobs = [];
for (const row of MATRIX) {
  for (const variant of list[row.bench]) {
    for (const profile of row.profiles) {
      for (const consume of row.consume) {
        // assertStrict flows only make sense on clean (dirty throws)
        if (row.bench === 'flow' && variant.startsWith('assertStrict') && profile !== 'clean') continue;
        jobs.push({ bench: row.bench, variant, profile, consume });
      }
    }
  }
}

console.error(`running ${jobs.length} isolated benchmark processes...`);
const results = [];
let i = 0;
for (const job of jobs) {
  i++;
  process.stderr.write(`[${String(i).padStart(3)}/${jobs.length}] ${job.bench} ${job.variant} ${job.profile}${job.consume ? ' +consume' : ''} ... `);
  const r = spawnSync(
    'node',
    ['--expose-gc', benchFile, 'run', job.bench, job.variant, job.profile, String(job.consume)],
    { encoding: 'utf8' },
  );
  if (r.status !== 0) {
    process.stderr.write(`FAILED\n${r.stderr}\n`);
    results.push({ ...job, error: (r.stderr || 'failed').trim().split('\n').pop() });
    continue;
  }
  const parsed = JSON.parse(r.stdout.trim());
  results.push(parsed);
  process.stderr.write(`${(parsed.opsPerSec / 1e6).toFixed(1)} M ops/s (±${parsed.madPct}%)\n`);
}

writeFileSync(join(here, 'results.json'), JSON.stringify(results, null, 2));

// ---------------------------------------------------------------------------
// tables
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + ' M' : (n / 1e3).toFixed(0) + ' k');

function table(bench, consume, anchor) {
  const rows = results.filter((r) => r.bench === bench && (r.consume ?? 0) === consume && !r.error);
  if (!rows.length) return;
  const profiles = [...new Set(rows.map((r) => r.profile))];
  const variants = [...new Set(rows.map((r) => r.variant))];
  console.log(`\n### ${bench}${consume ? ' (+downstream consume)' : ''}\n`);
  const header = ['variant', ...profiles.flatMap((p) => [`${p} ops/s`, `vs ${anchor}`])];
  console.log('| ' + header.join(' | ') + ' |');
  console.log('|' + header.map(() => '---').join('|') + '|');
  for (const v of variants) {
    const cells = [v];
    for (const p of profiles) {
      const row = rows.find((r) => r.variant === v && r.profile === p);
      const base = rows.find((r) => r.variant === anchor && r.profile === p);
      if (!row) {
        cells.push('-', '-');
        continue;
      }
      const speedup = base ? (row.opsPerSec / base.opsPerSec).toFixed(2) + 'x' : '-';
      cells.push(`${fmt(row.opsPerSec)} (±${row.madPct}%)`, speedup);
    }
    console.log('| ' + cells.join(' | ') + ' |');
  }
}

table('huk', 0, 'current');
table('strip', 0, 'suk');
table('strip', 1, 'suk');
table('flow', 0, 'assertStrict_current');

const failed = results.filter((r) => r.error);
if (failed.length) {
  console.log('\nFAILED JOBS:');
  for (const f of failed) console.log(` - ${f.bench} ${f.variant} ${f.profile}: ${f.error}`);
}
