// Host-side audit collector for the transform-free competitors (zod, typebox,
// ajv). The canonical full audit runs every competitor inside the shared podman
// image (`pnpm run audit:alignment`), where the ts-runtypes + typia BUILD-TIME
// transforms have produced real validators. But zod / typebox / ajv build their
// schemas at RUNTIME, so they can be audited directly on the host without the
// container — useful for fast iteration and for environments where the image
// can't be pulled.
//
// It runs each competitor's main.ts with AUDIT_ALIGNMENT=1 (see
// shared/harness/audit.ts → maybeAudit), which drops results/<name>.alignment.json,
// then leaves run-audit.mjs to join them. ts-runtypes and typia are NOT covered
// here:
//   - ts-runtypes is the REFERENCE: the shared samples encode its semantics and
//     it carries no overrides, so against the shared truth it has zero divergences
//     by construction (the bench gates on it). The in-container audit runs it for
//     real.
//   - typia needs its native ttsc/esbuild transform; run it in-container. Its
//     declared overrides (50 of them) already document its divergences.
//
// Requirements: a node_modules resolvable from competitors/<name>/ that provides
// zod / @sinclair/typebox / ajv / ajv-formats, plus a `tsx` runner. Point at them
// with AUDIT_TSX (path to the tsx binary); the deps must be installed somewhere
// node's upward node_modules walk will find (e.g. container-benchmarks/node_modules).
//
// Usage (from container-benchmarks/):
//   AUDIT_TSX=/path/to/tsx node _audit/host-collect.mjs [zod typebox ajv]

import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const BENCH_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RESULTS_DIR = process.env.BENCH_RESULTS_DIR ?? path.join(BENCH_DIR, 'results');
const TSX = process.env.AUDIT_TSX ?? 'tsx';
const DEFAULT = ['zod', 'typebox', 'ajv'];

const competitors = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT;

let failed = 0;
for (const competitor of competitors) {
  const main = path.join(BENCH_DIR, 'competitors', competitor, 'main.ts');
  console.log(`-------- audit (host): ${competitor} --------`);
  const result = spawnSync(TSX, [main], {
    cwd: BENCH_DIR,
    stdio: 'inherit',
    env: {...process.env, AUDIT_ALIGNMENT: '1', BENCH_RESULTS_DIR: RESULTS_DIR},
  });
  if (result.status !== 0) {
    console.error(`==> ${competitor} audit FAILED (status ${result.status}) — see output above`);
    failed++;
  }
}

console.log(
  `\n==> host audit done: ${competitors.length - failed}/${competitors.length} competitor(s) collected into ${RESULTS_DIR}`
);
console.log('   ts-runtypes (reference, 0 by construction) + typia (run in-container) are not collected here.');
console.log('   Next: node _audit/run-audit.mjs');
process.exit(failed > 0 ? 1 : 0);
