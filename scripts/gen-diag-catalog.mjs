// Generate the data the website diagnostics page renders.
//
// Two sources, joined here because nothing else sees both:
//   1. internal/diag (via `go run ./cmd/gen-diag-catalog`) — the authoritative
//      list of codes, their severities, and the docs prose (summary, fix, and
//      the verified triggering example) authored in internal/diag/prose.go.
//   2. packages/runtypes-devtools/src/diagnosticCatalog.ts (read as source via
//      Node type-stripping) — the user-facing headline + detail per code. We
//      read source, not the built dist, so the page never lags the catalog.
//
// Output: container-website/app/components/content/diagnostics-catalog.json,
// committed so the website builds without the Go toolchain. The generator is a
// dev-time sync step: run `pnpm run gen:diag-catalog` after changing either
// source. The merge also reports any code that is registered Go-side but has no
// message template (it would print the "Unrecognised diagnostic code" fallback).

import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const catalogSourcePath = resolve(repoRoot, 'packages/runtypes-devtools/src/diagnosticCatalog.ts');
const outPath = resolve(repoRoot, 'container-website/app/components/content/diagnostics-catalog.json');

// Subsystems group the code prefixes into the sections the page renders, in
// reading order. Descriptions are short, plain-language, and dash-free so they
// satisfy the website voice rules when the component renders them.
const SUBSYSTEMS = [
  {
    key: 'markers',
    label: 'Markers and call sites',
    description: 'Raised at a marker call, before the build can turn your type into a function.',
    prefixes: ['MKR', 'CTA', 'PFN', 'TMP'],
  },
  {
    key: 'validation',
    label: 'Validation',
    description: 'From createValidate and createGetValidationErrors.',
    prefixes: ['VL', 'VE'],
  },
  {
    key: 'serialization',
    label: 'Serialization',
    description: 'From the JSON and binary families, plus how classes are handled.',
    prefixes: ['PJ', 'PJS', 'RJ', 'SJ', 'TB', 'FB', 'CLS', 'JCP'],
  },
  {
    key: 'unknown-keys',
    label: 'Unknown keys',
    description: 'From hasUnknownKeys, stripUnknownKeys, and the rest of that family.',
    prefixes: ['HUK', 'SUK', 'UKE', 'UKU', 'UKW'],
  },
  {
    key: 'formats',
    label: 'Type formats',
    description: 'From the pattern and sample checks on a TypeFormat.',
    prefixes: ['FMT'],
  },
  {
    key: 'pure-functions',
    label: 'Pure functions',
    description: 'From the purity rules for registerPureFnFactory.',
    prefixes: ['PFE'],
  },
  {
    key: 'overrides',
    label: 'Overrides',
    description: 'From custom per-type function overrides.',
    prefixes: ['OVR'],
  },
];

/** Map a code prefix (its leading letters) to a subsystem key. */
const prefixToSubsystem = new Map();
for (const subsystem of SUBSYSTEMS) {
  for (const prefix of subsystem.prefixes) prefixToSubsystem.set(prefix, subsystem.key);
}

/** Leading uppercase letters of a code, e.g. `PJS001` -> `PJS`, `PFE9008` -> `PFE`. */
function codePrefix(code) {
  const match = code.match(/^[A-Z]+/);
  return match ? match[0] : code;
}

// 1. Authoritative code list + severity from Go.
const goDump = execFileSync('go', ['run', './cmd/gen-diag-catalog'], {
  cwd: repoRoot,
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
const goRecords = JSON.parse(goDump);

// 2. Message templates from the devtools catalog source.
const {DIAGNOSTIC_CATALOG} = await import(pathToFileURL(catalogSourcePath).href);

// 3. Merge. The Go list is the source of truth for which codes exist; the
// catalog supplies the message. A code with no catalog entry falls back to its
// Go-side title and is reported as a gap.
const gaps = [];
const orphanTemplates = Object.keys(DIAGNOSTIC_CATALOG).filter(
  (code) => !goRecords.some((record) => record.code === code),
);

const codes = goRecords.map((record) => {
  const subsystem = prefixToSubsystem.get(codePrefix(record.code)) ?? 'other';
  if (subsystem === 'other') console.warn(`gen-diag-catalog: no subsystem for ${record.code}`);
  const entry = DIAGNOSTIC_CATALOG[record.code];
  if (!entry) gaps.push(record.code);
  return {
    code: record.code,
    subsystem,
    severity: record.severity,
    headline: entry ? entry.headline : record.title,
    detail: entry && entry.detail ? entry.detail : null,
    hasMessage: Boolean(entry),
    summary: record.summary ?? null,
    fix: record.fix ?? null,
    example: record.example ?? null,
  };
});

const undocumented = codes.filter((code) => !code.summary).map((code) => code.code);

const subsystemOrder = new Map(SUBSYSTEMS.map((subsystem, index) => [subsystem.key, index]));
codes.sort((left, right) => {
  const bySection = (subsystemOrder.get(left.subsystem) ?? 99) - (subsystemOrder.get(right.subsystem) ?? 99);
  return bySection !== 0 ? bySection : left.code.localeCompare(right.code);
});

const output = {
  $generated:
    'by scripts/gen-diag-catalog.mjs from internal/diag + diagnosticCatalog.ts. Do not edit; run `pnpm run gen:diag-catalog`.',
  subsystems: SUBSYSTEMS.map(({key, label, description}) => ({key, label, description})),
  codes,
};

writeFileSync(outPath, JSON.stringify(output, null, 2) + '\n');

// Report so the dev sees coverage at a glance.
const bySeverity = codes.reduce((acc, code) => ({...acc, [code.severity]: (acc[code.severity] ?? 0) + 1}), {});
console.log(`gen-diag-catalog: wrote ${codes.length} codes to ${outPath.replace(repoRoot + '/', '')}`);
console.log(`  severities: ${JSON.stringify(bySeverity)}`);
console.log(`  by subsystem: ${JSON.stringify(
  codes.reduce((acc, code) => ({...acc, [code.subsystem]: (acc[code.subsystem] ?? 0) + 1}), {}),
)}`);
if (gaps.length) console.log(`  codes with no message template (fall back to Go title): ${gaps.join(', ')}`);
if (orphanTemplates.length) console.log(`  catalog templates with no Go code: ${orphanTemplates.join(', ')}`);
console.log(`  prose written for ${codes.length - undocumented.length}/${codes.length} codes`);
if (undocumented.length) console.log(`  still need a hand-written summary: ${undocumented.join(', ')}`);
