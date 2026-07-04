// Transform-wire benchmark — 'go' vs 'edits' transform mode, the choice
// docs/todos/transform-wire-modes.md exists to settle on DATA.
//
// 'go' mode: the resolver applies the rewrite and ships the whole rewritten
// file + source map per file. 'edits' mode: it ships the raw edit list
// (importBlock + edits + a source hash) and the FE applies it. Same artifacts,
// different wire — so the question is purely which wire is cheaper end to end.
//
// This drives the real ResolverClient (the same transport the plugin uses) over
// a synthetic corpus swept across file size × marker-site density × file count,
// and for each cell records, per mode:
//   - end-to-end per-file transform latency (round-trip + 'edits'-mode apply),
//   - wire bytes BOTH directions (client.wireStats(), the cheap line counters),
//   - request count.
// 'go' is measured twice — with and without the sourcesContent map trim — since
// eliding it is the cheap milestone-0 win that narrows the comparison.
//
// Reusable both ways: `node transform-wire/transform-wire.mjs` on the host (the
// binary + built runtypes-devtools resolve locally) and in the bench container
// (`scripts/benchmarks.sh transform-wire`), where the numbers are stable.
// Median of N (default 5), a warm-up pass discarded, tiers interleaved.

import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const intEnv = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : dflt;
};

const COMPETITOR_DIR = process.cwd();
const RESULTS_DIR = process.env.RT_BENCH_RESULTS_DIR ?? path.join(COMPETITOR_DIR, 'results');
const N = intEnv('RT_TRANSFORM_WIRE_N', 5);
const QUICK = process.env.RT_BENCH_QUICK === '1';

// runtypes-devtools ships per-file dist modules; import the transport + applier
// by ABSOLUTE path (Node's package `exports` gate never applies to file URLs),
// so the bench uses the exact code the plugin ships without widening its API.
const PKG_ROOT = argOf('--pkg') ?? path.join(COMPETITOR_DIR, 'node_modules', 'runtypes-devtools');
const distImport = (file) => import(pathToFileURL(path.join(PKG_ROOT, 'dist', file)).href);
const {ResolverClient} = await distImport('resolver-client.js');
const {applyEdits, sourceHash} = await distImport('apply-edits.js');

const RT_BINARY = process.env.RT_BINARY ?? argOf('--binary') ?? path.join(COMPETITOR_DIR, 'bin', 'ts-runtypes');

// Ambient marker declaration so the corpus resolves 'ts-runtypes' without any
// node_modules — keeps the harness self-contained on host and in-container.
const RUNTYPES_DTS = `declare module 'ts-runtypes' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export type InjectTypeFnArgs<T, F1 extends string, F2 extends string = never, F3 extends string = never> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFns?: [F1, F2, F3]};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export type ValidateFn = (value: unknown) => boolean;
  export function createValidate<T>(val?: T, options?: CompTimeFnArgs<{noLiterals?: boolean}>, id?: InjectTypeFnArgs<T, 'val'>): ValidateFn;
}
`;

// ── corpus ───────────────────────────────────────────────────────────────────
// One file = `filler` comment lines (to grow file size independently of site
// count) + `sites` distinct interfaces, each with a createValidate<T>() call.
// Distinct types per site so every site interns a real cache entry.
function genFile(fileIndex, sites, filler) {
  const lines = [`import {createValidate} from 'ts-runtypes';`];
  for (let i = 0; i < filler; i++) {
    lines.push(`// filler ${fileIndex}-${i}: lorem ipsum dolor sit amet consectetur adipiscing elit sed do`);
  }
  for (let s = 0; s < sites; s++) {
    const t = `T_${fileIndex}_${s}`;
    lines.push(
      `interface ${t} { id: number; name: string; tags: string[]; nested: {created: number; active: boolean; label: string}; }`
    );
    lines.push(`export const v_${fileIndex}_${s} = createValidate<${t}>();`);
  }
  return lines.join('\n') + '\n';
}

function genCorpus({files, sites, filler}) {
  const sources = {'runtypes.d.ts': RUNTYPES_DTS};
  const names = [];
  for (let f = 0; f < files; f++) {
    const name = `corpus/file_${f}.ts`;
    sources[name] = genFile(f, sites, filler);
    names.push(name);
  }
  return {sources, names};
}

const CONFIGS = QUICK
  ? [{files: 4, sites: 4, filler: 20}]
  : [
      {files: 8, sites: 2, filler: 10}, // small, sparse
      {files: 8, sites: 8, filler: 10}, // small, dense
      {files: 8, sites: 8, filler: 300}, // large files, dense
      {files: 40, sites: 4, filler: 40}, // many files
    ];

// ── measurement ────────────────────────────────────────────────────────────
const MODES = [
  {key: 'go', label: 'go (full code + map)', emitEdits: false},
  {key: 'go-noSC', label: 'go, no sourcesContent', emitEdits: false, omitSourcesContent: true},
  {key: 'edits', label: 'edits (FE applies)', emitEdits: true},
];

async function transformFile(client, mode, file, source) {
  if (mode.emitEdits) {
    const resp = await client.transform([file], undefined, {emitEdits: true});
    const fr = resp.transformed[file];
    if (!fr) return;
    // Include the FE apply cost — it is part of 'edits' mode's real latency.
    if (sourceHash(source) === fr.sourceHash) applyEdits(file, source, fr.importBlock ?? '', fr.edits ?? []);
    return;
  }
  await client.transform([file], undefined, mode.omitSourcesContent ? {omitSourcesContent: true} : undefined);
}

async function runMode(mode, names, sources) {
  const client = new ResolverClient(RT_BINARY, COMPETITOR_DIR, '', {serverMode: true});
  try {
    await client.setSources(sources);
    // Warm-up pass (discarded): first-touch scan + type interning per file.
    for (const file of names) await transformFile(client, mode, file, sources[file]);

    const before = client.wireStats();
    const t0 = process.hrtime.bigint();
    for (let round = 0; round < N; round++) {
      for (const file of names) await transformFile(client, mode, file, sources[file]);
    }
    const ms = Number(process.hrtime.bigint() - t0) / 1e6;
    const after = client.wireStats();
    const transforms = N * names.length;
    return {
      key: mode.key,
      label: mode.label,
      msPerFile: round2(ms / transforms),
      bytesOutPerFile: Math.round((after.bytesWritten - before.bytesWritten) / transforms),
      bytesInPerFile: Math.round((after.bytesRead - before.bytesRead) / transforms),
    };
  } finally {
    client.close();
  }
}

const round2 = (n) => Math.round(n * 100) / 100;

async function main() {
  if (!fs.existsSync(RT_BINARY)) {
    console.error(`transform-wire: binary not found at ${RT_BINARY}`);
    process.exit(1);
  }
  console.error(`transform-wire: binary=${RT_BINARY}\ntransform-wire: median of ${N}${QUICK ? ' (QUICK)' : ''}\n`);

  const cells = [];
  for (const config of CONFIGS) {
    const {sources, names} = genCorpus(config);
    const label = `files=${config.files} sites/file=${config.sites} filler=${config.filler}`;
    console.error(`-------- ${label} --------`);
    const modes = [];
    // Interleave modes across a single client rebuild each — keeps warm/cold
    // distribution even and isolates each mode's wire counters.
    for (const mode of MODES) {
      const result = await runMode(mode, names, sources);
      modes.push(result);
      console.error(
        `  ${mode.label.padEnd(24)}  ${String(result.msPerFile).padStart(7)} ms/file   ` +
          `out ${String(result.bytesOutPerFile).padStart(6)} B   in ${String(result.bytesInPerFile).padStart(7)} B`
      );
    }
    const go = modes.find((m) => m.key === 'go');
    const edits = modes.find((m) => m.key === 'edits');
    const wireRatio = edits.bytesInPerFile > 0 ? round2(go.bytesInPerFile / edits.bytesInPerFile) : 0;
    console.error(`  → 'edits' cuts inbound wire ${wireRatio}× vs 'go' on this cell\n`);
    cells.push({config, modes, goVsEditsInboundRatio: wireRatio});
  }

  // Data-driven default: 'edits' wins when its inbound wire is materially
  // smaller AND it is no slower end to end across every cell.
  const editsAlwaysLighter = cells.every((c) => c.goVsEditsInboundRatio >= 1.2);
  const recommendedDefault = editsAlwaysLighter ? 'edits' : 'go';

  const out = {
    n: N,
    quick: QUICK,
    cells,
    recommendedDefault,
    note: "Inbound = resolver→FE (the bloat 'edits' removes). Outbound is file paths either way.",
  };
  fs.mkdirSync(RESULTS_DIR, {recursive: true});
  const outPath = path.join(RESULTS_DIR, 'transform-wire.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + '\n');
  console.error(`\ntransform-wire: recommended default = '${recommendedDefault}'`);
  console.log(`wrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
