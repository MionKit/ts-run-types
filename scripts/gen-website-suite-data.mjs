#!/usr/bin/env node
// Transforms the gendocs/<suite>-suite.json + gendocs/cases/ artifacts (produced
// by scripts/export-*-suite.mjs) into compact, website-consumable JSON under
// website/public/suite-data/<suite>/:
//
//   index.json                  — { suite, label, sections: [{ key, label,
//                                   cases: [{ key, title, description, notes }] }] }
//                                 (one table per section; tidy rows)
//   <SECTION>__<case>.json      — { section, key, title, description, notes[],
//                                   pureType, schema, generated }
//                                 (lazy-fetched on row hover/expand)
//
// `pureType` is the case's type-first thunk body (e.g. `createValidate<{a:string}>()`),
// `schema` the value-first `RT.*` body, and `generated` the JIT function(s) the
// resolver emits for that type — extracted from the per-case cache-module dump so
// the docs show the actual compiled code, not a hand-written approximation.

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..');
const GENDOCS = path.join(REPO_ROOT, 'gendocs');
const OUT_ROOT = path.join(REPO_ROOT, 'website/public/suite-data');

// Which suites to emit, and how each maps onto its gendocs JSON + the
// type-first / schema body fields to read for the hover panel.
const SUITES = {
  validation: {label: 'Validation', json: 'validation-suite.json', pureField: 'validate', schemaField: 'validateSchema'},
  serialization: {
    label: 'Serialization',
    json: 'serialization-suite.json',
    // serialization cases key their type-first body off the clone encoder; the
    // schema body isn't extracted yet (added when the serialization exporter
    // grows a schema field) — fall back to null so the panel degrades cleanly.
    pureField: 'cloneEncoder',
    schemaField: 'cloneEncoderSchema',
  },
};

// UPPER_SNAKE category key → Title Case display label.
function sectionLabel(key) {
  return key
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function safe(s) {
  return String(s).replace(/[^A-Za-z0-9_]/g, '_');
}

function asNotesArray(notes) {
  if (!notes) return [];
  return Array.isArray(notes) ? notes : [notes];
}

// Pull the human-readable generated function(s) out of a case's dumped cache
// modules. Each module is `export const __rt_X=[tag,,,'id','kind','<code>'];`
// — we eval the array literal (trusted, build-time) and keep the string slots
// that are actual JS functions. Falls back to the raw module text on any
// surprise so the panel always shows *something* real.
function extractGenerated(caseDir) {
  if (!fs.existsSync(caseDir)) return '';
  const fns = [];
  const raw = [];
  for (const file of fs.readdirSync(caseDir).sort()) {
    if (!file.endsWith('.js')) continue;
    const text = fs.readFileSync(path.join(caseDir, file), 'utf8');
    raw.push(text.replace(/^\/\/ === .* ===$/gm, '').trim());
    for (const m of text.matchAll(/export const __rt_[A-Za-z0-9_]+=(\[[\s\S]*?\]);/g)) {
      try {
        const tuple = new Function(`return ${m[1]}`)();
        for (const slot of tuple) {
          if (typeof slot === 'string' && /^function\s/.test(slot)) {
            // Stored as `function f(v){…}return f` — keep just the definition.
            fns.push(slot.replace(/}return\s+[A-Za-z0-9_]+\s*$/, '}'));
          }
        }
      } catch {
        /* fall through to raw */
      }
    }
  }
  const seen = new Set();
  const uniq = fns.filter((f) => (seen.has(f) ? false : seen.add(f)));
  return uniq.length > 0 ? uniq.join('\n\n') : raw.join('\n\n');
}

function emitSuite(suiteKey, cfg) {
  const jsonPath = path.join(GENDOCS, cfg.json);
  if (!fs.existsSync(jsonPath)) {
    process.stderr.write(`skip ${suiteKey}: ${path.relative(REPO_ROOT, jsonPath)} not found (run the exporter first)\n`);
    return null;
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  const outDir = path.join(OUT_ROOT, suiteKey);
  fs.rmSync(outDir, {recursive: true, force: true});
  fs.mkdirSync(outDir, {recursive: true});

  const sections = [];
  let caseCount = 0;
  for (const [section, cases] of Object.entries(data)) {
    const rows = [];
    for (const [key, c] of Object.entries(cases)) {
      const notes = asNotesArray(c.validateNotes ?? c.serializeNotes ?? c.notes);
      rows.push({key, title: c.title ?? key, description: c.description ?? '', notes});

      const detail = {
        section,
        key,
        title: c.title ?? key,
        description: c.description ?? '',
        notes,
        pureType: typeof c[cfg.pureField] === 'string' ? c[cfg.pureField] : '',
        schema: typeof c[cfg.schemaField] === 'string' ? c[cfg.schemaField] : '',
        generated: extractGenerated(path.join(GENDOCS, 'cases', `${safe(section)}__${safe(key)}__validate`)),
      };
      fs.writeFileSync(path.join(outDir, `${safe(section)}__${safe(key)}.json`), JSON.stringify(detail));
      caseCount += 1;
    }
    sections.push({key: section, label: sectionLabel(section), cases: rows});
  }

  const index = {suite: suiteKey, label: cfg.label, sections};
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index, null, 0));
  return {sections: sections.length, cases: caseCount};
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const keys = wanted.length > 0 ? wanted : Object.keys(SUITES);
for (const key of keys) {
  const cfg = SUITES[key];
  if (!cfg) {
    process.stderr.write(`unknown suite '${key}' (known: ${Object.keys(SUITES).join(', ')})\n`);
    continue;
  }
  const res = emitSuite(key, cfg);
  if (res) process.stdout.write(`${key}: ${res.sections} sections, ${res.cases} cases → website/public/suite-data/${key}/\n`);
}
