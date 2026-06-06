#!/usr/bin/env node
// Compares two bench-compile.mjs result files and prints per-axis verdicts.
//
//   node scripts/bench-compare.mjs bench/results/baseline.json bench/results/new.json
//
// Axes: wall time (mean scanFiles ms), Go alloc bytes per op, and the Go-side
// phase totals. Noise floors: time ±3%, allocs ±1% (allocs are near-
// deterministic — anything beyond 1% is a real change). Per-unit deltas
// beyond the floor are aggregated; the summary prints the geometric-mean
// ratio per axis plus the top movers in both directions.

import fs from 'node:fs';

const [oldPath, newPath] = process.argv.slice(2);
if (!oldPath || !newPath) {
  process.stderr.write('usage: bench-compare.mjs <old.json> <new.json>\n');
  process.exit(1);
}
const before = JSON.parse(fs.readFileSync(oldPath, 'utf8'));
const after = JSON.parse(fs.readFileSync(newPath, 'utf8'));

const TIME_FLOOR = 0.03;
const ALLOC_FLOOR = 0.01;

function collect(section, beforeTree, afterTree, axes) {
  const rows = [];
  for (const key of Object.keys(beforeTree ?? {})) {
    const b = beforeTree[key];
    const a = afterTree?.[key];
    if (!b || !a || b.error || a.error) continue;
    const row = {key: `${section}:${key}`};
    for (const axis of axes) {
      const bv = axis.pick(b);
      const av = axis.pick(a);
      if (!Number.isFinite(bv) || !Number.isFinite(av) || bv <= 0) continue;
      row[axis.name] = {before: bv, after: av, ratio: av / bv};
    }
    rows.push(row);
  }
  return rows;
}

const AXES = [
  {name: 'wallMs', floor: TIME_FLOOR, pick: (u) => u.wallMs?.mean},
  {name: 'goTotalMs', floor: TIME_FLOOR, pick: (u) => u.goTotalMs?.mean},
  {name: 'allocBytes', floor: ALLOC_FLOOR, pick: (u) => u.allocBytes?.mean},
];

const rows = [
  ...collect('micro', before.micro, after.micro, AXES),
  ...collect('macro', before.macro, after.macro, AXES),
];
if (rows.length === 0) {
  process.stderr.write('no comparable units between the two files\n');
  process.exit(1);
}

function geomean(ratios) {
  if (ratios.length === 0) return 1;
  return Math.exp(ratios.reduce((s, r) => s + Math.log(r), 0) / ratios.length);
}

process.stdout.write(`baseline: ${oldPath} (${before.meta?.sha} ${before.meta?.date})\n`);
process.stdout.write(`candidate: ${newPath} (${after.meta?.sha} ${after.meta?.date})\n`);
process.stdout.write(`units compared: ${rows.length}\n\n`);

for (const axis of AXES) {
  const withAxis = rows.filter((r) => r[axis.name]);
  if (withAxis.length === 0) continue;
  const ratios = withAxis.map((r) => r[axis.name].ratio);
  const gm = geomean(ratios);
  const improved = withAxis.filter((r) => r[axis.name].ratio < 1 - axis.floor).length;
  const regressed = withAxis.filter((r) => r[axis.name].ratio > 1 + axis.floor).length;
  const neutral = withAxis.length - improved - regressed;
  const pct = ((gm - 1) * 100).toFixed(2);
  const verdict = gm < 1 - axis.floor ? 'IMPROVED' : gm > 1 + axis.floor ? 'REGRESSED' : 'neutral';
  process.stdout.write(`${axis.name}: geomean ${pct}% (${verdict}) — ${improved} improved / ${neutral} neutral / ${regressed} regressed (floor ±${axis.floor * 100}%)\n`);
  const movers = [...withAxis].sort((a, b) => a[axis.name].ratio - b[axis.name].ratio);
  const fmt = (r) =>
    `    ${(((r[axis.name].ratio - 1) * 100).toFixed(1) + '%').padStart(8)}  ${r[axis.name].before.toFixed(2)} -> ${r[axis.name].after.toFixed(2)}  ${r.key}\n`;
  for (const r of movers.slice(0, 5)) if (r[axis.name].ratio < 1 - axis.floor) process.stdout.write(fmt(r));
  for (const r of movers.slice(-5)) if (r[axis.name].ratio > 1 + axis.floor) process.stdout.write(fmt(r));
  process.stdout.write('\n');
}
