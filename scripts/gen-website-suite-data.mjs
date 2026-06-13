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
    // type-first body = the default 'clone' encoder (`createJsonEncoder<T>()`);
    // schema body = the value-first `schemaEncoder` (`createJsonEncoder(RT.…)`).
    pureField: 'cloneEncoder',
    schemaField: 'schemaEncoder',
  },
  'format-validation': {
    label: 'Format · Validation',
    json: 'format-validation-suite.json',
    pureField: 'validate',
    schemaField: 'validateSchema',
  },
  'format-serialization': {
    label: 'Format · Serialization',
    json: 'format-serialization-suite.json',
    pureField: 'cloneEncoder',
    schemaField: 'schemaEncoder',
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

// Tidy a type-first / schema thunk body for display. Self-declaring cases write
// their type(s) inline and end with `return createX<T>()`; drop that one `return`
// keyword so the snippet reads as a usage example (`interface User {…}\n
// createValidate<User>()`) instead of a function body. Expression-body thunks
// (no `return`) pass through untouched.
function forDisplay(body) {
  if (typeof body !== 'string') return '';
  return body.replace(/(^|\n)[ \t]*return (?=create[A-Za-z]+[<(])/, '$1');
}

// Pull the human-readable generated function(s) out of a case's dumped cache
// modules. Each module is `export const __rt_X=[tag,,,'id','kind','<code>'];`
// — we eval the array literal (trusted, build-time) and keep the `<code>` slot,
// which is the FULL function-constructor body the runtime feeds to `new
// Function`. That body is `<context decls>function NAME(v){…}return NAME`: the
// context decls (hoisted `const ctxFnN = …` element/member validators — the
// optimised inner code) come BEFORE the entry function and reference it, so we
// detect the slot by "contains a named function" (not "starts with function")
// and keep everything except the trailing `return NAME` constructor artifact —
// preserving the context. Falls back to the raw module text on any surprise so
// the panel always shows *something* real.
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
          // The code slot is the only string carrying a named function
          // definition (the other strings are the family tag / id / kind /
          // typeName). Keep context decls + the function; drop the trailing
          // `return NAME` so the snippet is valid top-level JS (prettifiable).
          if (typeof slot === 'string' && /function\s+[A-Za-z0-9_]+\s*\(/.test(slot)) {
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
        pureType: forDisplay(c[cfg.pureField]),
        schema: forDisplay(c[cfg.schemaField]),
        generated: extractGenerated(path.join(GENDOCS, 'cases', suiteKey, `${safe(section)}__${safe(key)}`)),
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
