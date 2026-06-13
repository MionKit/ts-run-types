// Validation benchmark runner.
//
// For every case × library it (1) verifies correctness — every `valid` sample
// must pass and every `invalid` sample must fail — and (2) measures validation
// throughput. Libraries that cannot express a case's type are marked
// "not supported" and skipped (not counted as failures). The process exits
// non-zero if any SUPPORTED validator is incorrect, so the run doubles as a
// conformance check across all libraries.

import {performance} from 'node:perf_hooks';
import {CASES, SAMPLES, type CaseName} from './suite/samples.ts';
import {NOT_SUPPORTED, type ValidatorMap, type ValidatorOrUnsupported} from './libs/types.ts';
import {tsRunTypesValidators} from './libs/tsRunTypes.ts';
import {zodValidators} from './libs/zod.ts';
import {typeboxValidators} from './libs/typebox.ts';
import {ajvValidators} from './libs/ajv.ts';

// Typia needs its compile-time transform; load defensively so a missing
// transform degrades the whole typia column to "not supported" instead of
// breaking the run.
async function loadTypia(): Promise<ValidatorMap | null> {
  try {
    const mod = await import('./libs/typia.ts');
    // Touch one validator to surface an untransformed createIs() at load time.
    if (typeof mod.typiaValidators.string !== 'function') return null;
    mod.typiaValidators.string(1);
    return mod.typiaValidators;
  } catch {
    return null;
  }
}

interface Cell {
  status: 'ok' | 'FAIL' | 'n/a';
  opsSec: number;
  detail?: string;
}

/** Time how many individual validations per second a validator sustains over a
 *  case's full sample set. */
function benchOps(validator: (v: unknown) => boolean, samples: unknown[], ms = 250): number {
  for (let i = 0; i < 2000; i++) for (const s of samples) validator(s);
  let batches = 0;
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    for (const s of samples) validator(s);
    batches++;
  }
  const seconds = (performance.now() - t0) / 1000;
  return (batches * samples.length) / seconds;
}

function evaluate(v: ValidatorOrUnsupported, name: CaseName): Cell {
  if (v === NOT_SUPPORTED) return {status: 'n/a', opsSec: 0};
  const {valid, invalid} = SAMPLES[name];
  const validPass = valid.every((s) => v(s) === true);
  const invalidFail = invalid.every((s) => v(s) === false);
  if (!validPass || !invalidFail) {
    const badValid = valid.findIndex((s) => v(s) !== true);
    const badInvalid = invalid.findIndex((s) => v(s) !== false);
    const detail =
      badValid >= 0 ? `valid[${badValid}] rejected` : `invalid[${badInvalid}] accepted`;
    return {status: 'FAIL', opsSec: 0, detail};
  }
  return {status: 'ok', opsSec: benchOps(v, [...valid, ...invalid])};
}

const fmt = (n: number) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : `${n.toFixed(0)}`;

const pad = (s: string, n: number) => s.padEnd(n);
const padL = (s: string, n: number) => s.padStart(n);

export async function run(): Promise<number> {
  const typia = await loadTypia();
  const libs: Array<{name: string; map: ValidatorMap}> = [
    {name: 'ts-go-run-types', map: tsRunTypesValidators},
    {name: 'zod', map: zodValidators},
    {name: 'typebox', map: typeboxValidators},
    {name: 'ajv', map: ajvValidators},
    {name: 'typia', map: typia ?? makeAllUnsupported()},
  ];

  let failures = 0;
  const COL = 16;
  const head = pad('case', 16) + libs.map((l) => padL(l.name, COL)).join('');
  console.log('\nCorrectness + throughput (validations/sec)\n');
  console.log(head);
  console.log('-'.repeat(head.length));

  for (const {name} of CASES) {
    let row = pad(name, 16);
    for (const lib of libs) {
      const cell = evaluate(lib.map[name], name);
      if (cell.status === 'FAIL') {
        failures++;
        row += padL(`FAIL`, COL);
        console.error(`  ${lib.name} / ${name}: ${cell.detail}`);
      } else if (cell.status === 'n/a') {
        row += padL('—', COL);
      } else {
        row += padL(`${fmt(cell.opsSec)}/s`, COL);
      }
    }
    console.log(row);
  }

  // Coverage summary: how many cases each library actually validated.
  console.log('\nCoverage (cases with a real validator):');
  for (const lib of libs) {
    const supported = CASES.filter(({name}) => lib.map[name] !== NOT_SUPPORTED).length;
    console.log(`  ${pad(lib.name, 16)} ${supported}/${CASES.length}`);
  }

  if (failures > 0) {
    console.error(`\n✗ ${failures} validator(s) produced incorrect results.`);
    return 1;
  }
  console.log('\n✓ every supported validator passed correctness for all cases.');
  return 0;
}

function makeAllUnsupported(): ValidatorMap {
  const map = {} as ValidatorMap;
  for (const {name} of CASES) map[name] = NOT_SUPPORTED;
  return map;
}

run().then((code) => process.exit(code));
