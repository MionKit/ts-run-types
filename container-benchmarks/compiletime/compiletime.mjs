// Compile-time benchmark — the THIRD axis next to runtime throughput (`bench`) and
// type-instantiation cost (`bench:typecost`). It measures the wall-clock cost every
// user pays at BUILD time: for one competitor (`--competitor <name>`) it builds a
// per-case probe through that competitor's REAL build pipeline and times it.
//
//   ts-runtypes      vite + the runtypes-devtools plugin (the Go resolver runs and
//                    walks the case's type graph, emits the virtual modules)
//   typia            esbuild + @ttsc/unplugin typia transform (native-Go transform)
//   zod/typebox/ajv  plain vite, no transform — the baseline (no-transform) columns
//
// Two numbers per case, the disk-cache story the project's compile-time pitch turns on:
//   cold — RT disk cache wiped first, so the resolver recomputes from scratch (the
//          honest "first CI build" cost).
//   warm — immediate rebuild with the cache populated (the marginal no-op rebuild).
// Both are baseline-subtracted by a trivial probe built the same way, so the number
// is the MARGINAL per-case transform cost, not the bundler/import/startup scaffold
// (mirrors how typecost.mjs subtracts a baseline instantiation count). Each cell is
// the median of N repeats (drop top + bottom) to tame wall-clock wobble.
//
// Why wall-clock is the headline (not CPU): the RT plugin and typia run their
// transform in a SUBPROCESS, whose CPU is invisible to process.cpuUsage(); only the
// wall captures it. CPU is still recorded for the record (meaningful for the
// no-transform baseline columns, an undercount for the transforming ones).
//
// Module resolution: this driver lives at /bench/compiletime but is RUN with cwd =
// competitors/<name> (the bash dispatch does `cd competitors/<name> && node
// ../../compiletime/compiletime.mjs`). vite / esbuild / typescript / the bind-mounted
// plugin all live in THAT competitor's node_modules, so the driver resolves every
// tool through a require anchored at the competitor dir — exactly how `vite build`
// there would. The probe is written INTO the competitor dir so its bare imports
// (`ts-runtypes`, `zod`, …) and the verbatim realworld relative imports resolve.

import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {makeExtractors} from '../_lib/extract-cases.mjs';

// ── config ───────────────────────────────────────────────────────────────────

const argOf = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const intEnv = (name, dflt) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : dflt;
};

const COMPETITOR = argOf('--competitor');
if (!COMPETITOR) {
  console.error('compiletime: --competitor <name> is required');
  process.exit(1);
}
const COMPETITOR_DIR = process.cwd(); // bash runs us with cwd = competitors/<name>
const RESULTS_DIR = process.env.BENCH_RESULTS_DIR ?? '/bench/results';
const CASE_FILTER = (process.env.BENCH_CASE ?? '').toLowerCase();
const N_COLD = intEnv('COMPILETIME_N_COLD', 3);
const N_WARM = intEnv('COMPILETIME_N_WARM', 5);
const MAX_CASES = intEnv('COMPILETIME_MAX_CASES', 0); // 0 = all

const PROBE = path.join(COMPETITOR_DIR, '__compiletime_probe.ts');
const PROBE_TSCONFIG = path.join(COMPETITOR_DIR, '__compiletime_tsconfig.json');
const RT_CACHE = path.join(COMPETITOR_DIR, '.compiletime-rt-cache');
const VITE_CACHE = path.join(COMPETITOR_DIR, '.compiletime-vite-cache');
const RT_BINARY = process.env.RT_BINARY ?? path.join(COMPETITOR_DIR, 'bin', 'ts-runtypes');

// ── tool resolution (anchored at the competitor dir) ─────────────────────────

const req = createRequire(path.join(COMPETITOR_DIR, '__compiletime_resolve.cjs'));
// Tools with a `require`/CJS entry (vite, esbuild, typescript) resolve through the
// competitor's node_modules via createRequire.
const importFrom = async (spec) => import(pathToFileURL(req.resolve(spec)).href);

// runtypes-devtools is import-ONLY (its exports map has no `require` condition), so
// createRequire can't resolve it. It is bind-mounted at a known path, so read its
// exports map directly and import the subpath target (honoring the `import` condition).
async function importExport(packageRoot, subpath) {
  const pkg = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const entry = pkg.exports?.[subpath] ?? pkg.exports?.['.'];
  const rel = typeof entry === 'string' ? entry : entry?.import ?? entry?.node ?? entry?.default;
  if (!rel) throw new Error(`no import target for ${subpath} in ${packageRoot}`);
  return import(pathToFileURL(path.join(packageRoot, rel)).href);
}

// The extractor only needs `typescript` to parse source (AST) — any copy works.
// typia's dir has @typescript/native-preview, not `typescript`, so fall back to a
// sibling competitor (or the typecost dir) that ships the `typescript` package.
async function resolveTypescript() {
  const competitors = path.resolve(COMPETITOR_DIR, '..');
  const candidates = [
    COMPETITOR_DIR,
    path.join(competitors, 'ts-runtypes'),
    path.join(competitors, 'zod'),
    path.join(competitors, 'typebox'),
    path.resolve(competitors, '..', 'typecost'),
  ];
  for (const dir of candidates) {
    try {
      const r = createRequire(path.join(dir, '__rt_resolve.cjs'));
      return await import(pathToFileURL(r.resolve('typescript')).href);
    } catch {
      /* try next */
    }
  }
  throw new Error('typescript not resolvable from any competitor dir');
}
const tsMod = await resolveTypescript();
const ts = tsMod.default ?? tsMod;
const {sf, extractTypeForm, extractSchemaCompetitor} = makeExtractors(ts);

// ── probe assembly ───────────────────────────────────────────────────────────

const decls = (locals) => (locals.length ? locals.join('\n') + '\n' : '');
const wipe = (dir) => {
  try {
    fs.rmSync(dir, {recursive: true, force: true});
  } catch {
    /* best effort */
  }
};

// A tiny ajv extractor: ajv cases inline the schema inside `ajv.compile(ARG)` (no
// `const schema = …`), so reuse of extractSchemaCompetitor doesn't apply. Pull each
// case's build-thunk `*.compile(ARG)` first-argument text + any statements declared
// before it (a shared sub-schema the schema references). Best-effort; a miss falls
// back to an import-only baseline probe so the column still gets a number.
function extractAjv(file) {
  const source = sf(file);
  const entries = {};
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const d of node.declarationList.declarations) {
      if (d.name.getText(source) !== 'cases' || !d.initializer || !ts.isObjectLiteralExpression(d.initializer)) continue;
      for (const prop of d.initializer.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = prop.name.getText(source).replace(/['"]/g, '');
        const obj = prop.initializer;
        if (!ts.isObjectLiteralExpression(obj)) continue; // NOT_SUPPORTED
        const build = obj.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source) === 'build');
        if (!build || !ts.isArrowFunction(build.initializer) || !ts.isBlock(build.initializer.body)) continue;
        const locals = [];
        let arg = null;
        for (const stmt of build.initializer.body.statements) {
          let compileArg = null;
          const visit = (n) => {
            if (compileArg || !n) return;
            if (ts.isCallExpression(n) && /\.compile$/.test(n.expression.getText(source)) && n.arguments.length) {
              compileArg = n.arguments[0].getText(source);
              return;
            }
            n.forEachChild(visit);
          };
          visit(stmt);
          if (compileArg) {
            arg = compileArg;
            break;
          }
          const text = stmt.getText(source);
          // keep shared sub-schema decls; drop the ajv plumbing we reconstruct ourselves
          if (!/new Ajv\b|addFormats\b/.test(text)) locals.push(text);
        }
        if (arg) entries[key] = {locals, schemaArg: arg};
      }
    }
  });
  return entries;
}

// Build the probe `.ts` source for one case. Returns null when the case has no
// extractable form for this competitor (NOT_SUPPORTED).
function probeFor(model, key) {
  const e = model.entries[key];
  if (!e) return null;
  const pre = model.preamble.join('\n');
  if (model.kind === 'type') {
    const call = COMPETITOR === 'typia' ? `typia.createIs<${e.typeText}>()` : `createValidate<${e.typeText}>()`;
    return `${pre}\n{\n${decls(e.locals)}const __v = ${call};\nvoid __v;\n}\n`;
  }
  if (model.kind === 'schema') {
    return `${pre}\n${decls(e.locals)}const __s = ${e.exprText};\nvoid __s;\n`;
  }
  // ajv
  return `${pre}\n${decls(e.locals)}const __ajv = new Ajv({strict: false, allowUnionTypes: true});\naddFormats(__ajv, {mode: 'full'});\nconst __v = __ajv.compile(${e.schemaArg});\nvoid __v;\n`;
}

// The trivial baseline probe per competitor: the same import scaffold with the
// cheapest possible form, so subtracting its build time leaves the marginal cost.
function baselineProbe(model) {
  const pre = model.preamble.join('\n');
  if (model.kind === 'type') {
    const call = COMPETITOR === 'typia' ? `typia.createIs<string>()` : `createValidate<string>()`;
    return `${pre}\nconst __v = ${call};\nvoid __v;\n`;
  }
  if (model.kind === 'schema') {
    const expr = COMPETITOR === 'typebox' ? 'Type.String()' : 'z.string()';
    return `${pre}\nconst __s = ${expr};\nvoid __s;\n`;
  }
  return `${pre}\nconst __ajv = new Ajv({strict: false});\naddFormats(__ajv, {mode: 'full'});\nconst __v = __ajv.compile({type: 'string'});\nvoid __v;\n`;
}

// ── per-competitor build pipeline ────────────────────────────────────────────

let runBuild; // async (probePath) => void — set per competitor below

async function setupPipeline() {
  if (COMPETITOR === 'typia') {
    const {buildProbe} = await import(pathToFileURL(path.join(COMPETITOR_DIR, 'esbuild.config.mjs')).href);
    // A probe-scoped tsconfig so ttsc's program includes the probe (typia's own
    // tsconfig only `include`s cases.ts/main.ts); extends it to keep the typia
    // transform plugin in compilerOptions.
    fs.writeFileSync(
      PROBE_TSCONFIG,
      JSON.stringify({extends: './tsconfig.json', include: ['__compiletime_probe.ts', '../../shared']}, null, 2)
    );
    runBuild = (probePath) => buildProbe(probePath, PROBE_TSCONFIG);
    return;
  }
  // every other competitor builds through vite (ts-runtypes adds the RT plugin).
  // vite's CJS entry exposes `build` on the default export under dynamic import.
  const viteMod = await importFrom('vite');
  const viteBuild = viteMod.build ?? viteMod.default?.build;
  if (typeof viteBuild !== 'function') throw new Error('vite build() not found');
  let rtPlugin = null;
  if (COMPETITOR === 'ts-runtypes') {
    rtPlugin = (await importExport(path.join(COMPETITOR_DIR, 'node_modules', 'runtypes-devtools'), './vite')).default;
    // A probe-scoped tsconfig so tsgo loads the probe (the competitor's own tsconfig
    // only `include`s cases.ts/main.ts); compilerOptions come from the base via extends.
    fs.writeFileSync(
      PROBE_TSCONFIG,
      JSON.stringify({extends: './tsconfig.json', include: ['__compiletime_probe.ts', '../../shared']}, null, 2)
    );
  }
  // A FRESH plugin instance per build → a fresh resolver subprocess, so the Go
  // resolver carries no in-memory state across cases. Combined with wiping the disk
  // cache for cold builds, this makes "cold" an honest from-scratch resolve (the
  // resolver's per-type compute), and "warm" an honest disk-cache load.
  runBuild = (probePath) =>
    viteBuild({
      configFile: false,
      root: COMPETITOR_DIR,
      logLevel: 'silent',
      clearScreen: false,
      cacheDir: VITE_CACHE,
      plugins: rtPlugin
        ? [rtPlugin({binary: RT_BINARY, cwd: COMPETITOR_DIR, tsconfig: '__compiletime_tsconfig.json', cacheDir: RT_CACHE})]
        : [],
      build: {
        ssr: probePath,
        write: false,
        minify: false,
        target: 'node22',
        emptyOutDir: false,
        reportCompressedSize: false,
        rollupOptions: {onwarn() {}},
      },
    });
}

// One timed build. cold=true wipes the RT + vite caches first so the resolver
// recomputes; cold=false rebuilds against the populated cache.
async function timedBuild(probeSource, cold) {
  fs.writeFileSync(PROBE, probeSource);
  if (cold) {
    wipe(RT_CACHE);
    wipe(VITE_CACHE);
  }
  const cpu0 = process.cpuUsage();
  const t0 = process.hrtime.bigint();
  await runBuild(PROBE);
  const wallMs = Number(process.hrtime.bigint() - t0) / 1e6;
  const cpu = process.cpuUsage(cpu0);
  return {wallMs, cpuMs: (cpu.user + cpu.system) / 1000};
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  if (s.length >= 3) {
    s.shift();
    s.pop();
  }
  return s.reduce((a, b) => a + b, 0) / s.length;
}

// Measure cold (N_COLD reps) + warm (N_WARM reps) for one probe source. The first
// build of a fresh probe is always cold; warm reps reuse the just-populated cache.
async function measure(probeSource) {
  const cold = [];
  const coldCpu = [];
  for (let i = 0; i < N_COLD; i++) {
    const m = await timedBuild(probeSource, true);
    cold.push(m.wallMs);
    coldCpu.push(m.cpuMs);
  }
  const warm = [];
  const warmCpu = [];
  for (let i = 0; i < N_WARM; i++) {
    const m = await timedBuild(probeSource, false);
    warm.push(m.wallMs);
    warmCpu.push(m.cpuMs);
  }
  return {cold: median(cold), warm: median(warm), coldCpu: median(coldCpu), warmCpu: median(warmCpu)};
}

// ── run ──────────────────────────────────────────────────────────────────────

function loadModel() {
  const casesFile = path.join(COMPETITOR_DIR, 'cases.ts');
  if (COMPETITOR === 'ts-runtypes') return {kind: 'type', ...extractTypeForm(casesFile, 'cases', 'createValidate')};
  if (COMPETITOR === 'typia') return {kind: 'type', ...extractTypeForm(casesFile, 'cases', 'typia.createIs')};
  if (COMPETITOR === 'zod' || COMPETITOR === 'typebox') return {kind: 'schema', ...extractSchemaCompetitor(casesFile, 'cases')};
  if (COMPETITOR === 'ajv') {
    const ext = extractSchemaCompetitor(casesFile, 'cases'); // for the preamble (imports)
    return {kind: 'ajv', preamble: ext.preamble, entries: extractAjv(casesFile)};
  }
  throw new Error(`unknown competitor ${COMPETITOR}`);
}

function cleanup() {
  for (const f of [PROBE, PROBE_TSCONFIG]) wipe(f);
  wipe(RT_CACHE);
  wipe(VITE_CACHE);
}

async function main() {
  const model = loadModel();
  // Row order + keys come from the type-form `keys` (total over the suite) when
  // present; schema/ajv models only expose supported keys, which is all we measure.
  const allKeys = model.keys ?? Object.keys(model.entries);
  let keys = allKeys.filter((k) => model.entries[k] && (!CASE_FILTER || k.toLowerCase().includes(CASE_FILTER)));
  if (MAX_CASES) keys = keys.slice(0, MAX_CASES);
  if (!keys.length) {
    console.error(`compiletime[${COMPETITOR}]: no cases matched (filter='${CASE_FILTER}')`);
    cleanup();
    process.exit(CASE_FILTER ? 1 : 0);
  }

  await setupPipeline();

  // Informational "build floor": one cold+warm build of a trivial probe — the fixed
  // per-build cost (bundler init + a resolver spawn over the cheapest type). It is
  // NOT subtracted: per-case marginal cost sits below the wall-clock noise floor, so
  // subtraction only yields noisy zeros. Cells carry the ABSOLUTE build wall-clock, the
  // honest "what a build of this case costs"; the no-transform zod/typebox/ajv columns
  // ARE the baseline (read the transform overhead off the row), and the cold→warm gap
  // is the disk cache paying for itself.
  let base = {cold: 0, warm: 0, coldCpu: 0, warmCpu: 0};
  try {
    base = await measure(baselineProbe(model));
  } catch (err) {
    console.error(`compiletime[${COMPETITOR}]: baseline build failed (${err?.message ?? err}); continuing.`);
  }

  const rows = [];
  let done = 0;
  for (const key of keys) {
    const dot = key.indexOf('.');
    const group = dot >= 0 ? key.slice(0, dot) : key;
    const name = dot >= 0 ? key.slice(dot + 1) : key;
    const src = probeFor(model, key);
    if (!src) continue;
    try {
      const m = await measure(src);
      rows.push({
        key,
        group,
        name,
        status: 'ok',
        cold_ms: round(m.cold),
        warm_ms: round(m.warm),
        cold_cpu_ms: round(m.coldCpu),
        warm_cpu_ms: round(m.warmCpu),
      });
    } catch (err) {
      rows.push({key, group, name, status: 'err', detail: String(err?.message ?? err).slice(0, 200)});
    }
    done++;
    if (done % 10 === 0 || done === keys.length) console.error(`compiletime[${COMPETITOR}]: ${done}/${keys.length}`);
  }

  cleanup();
  report(model, rows, base);
  if (!CASE_FILTER) writeResults(rows, base);
}

const round = (n) => Math.round(n * 100) / 100;

function report(model, rows, base) {
  const ok = rows.filter((r) => r.status === 'ok');
  const errs = rows.filter((r) => r.status === 'err');
  const avg = (f) => (ok.length ? round(ok.reduce((a, r) => a + r[f], 0) / ok.length) : 0);
  console.log(`\nCompile-time build cost — ${COMPETITOR} (${ok.length} cases, absolute wall-clock, median of N)`);
  console.log(`  build floor (trivial probe): cold ${round(base.cold)}ms · warm ${round(base.warm)}ms`);
  if (ok.length) console.log(`  per-case avg: cold ${avg('cold_ms')}ms · warm ${avg('warm_ms')}ms`);
  if (errs.length) {
    console.log(`  ${errs.length} build error(s):`);
    for (const e of errs.slice(0, 8)) console.log(`    ${e.key}: ${e.detail}`);
  }
}

function writeResults(rows, base) {
  fs.mkdirSync(RESULTS_DIR, {recursive: true});
  const cases = rows.filter((r) => r.status === 'ok').map((r) => ({
    key: r.key,
    group: r.group,
    name: r.name,
    cold_ms: r.cold_ms,
    warm_ms: r.warm_ms,
    cold_cpu_ms: r.cold_cpu_ms,
    warm_cpu_ms: r.warm_cpu_ms,
  }));
  const out = {
    competitor: COMPETITOR,
    transform: COMPETITOR === 'ts-runtypes' || COMPETITOR === 'typia',
    // The fixed per-build floor (trivial probe): bundler init + a from-scratch resolve
    // of the cheapest type. Cells are ABSOLUTE, so this is the reference floor.
    floor_cold_ms: round(base.cold),
    floor_warm_ms: round(base.warm),
    cases,
    avg_cold_ms: round(cases.reduce((a, c) => a + c.cold_ms, 0) / (cases.length || 1)),
    avg_warm_ms: round(cases.reduce((a, c) => a + c.warm_ms, 0) / (cases.length || 1)),
  };
  fs.writeFileSync(path.join(RESULTS_DIR, `${COMPETITOR}.compiletime.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`\nwrote ${path.join(RESULTS_DIR, `${COMPETITOR}.compiletime.json`)} (${cases.length} cases)`);
}

main().catch((err) => {
  console.error(err);
  cleanup();
  process.exit(1);
});
