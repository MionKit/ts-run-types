#!/usr/bin/env node
// Procedural rename: isType -> validate, getTypeErrors/typeErrors -> getValidationErrors/validationErrors.
//
// Why a script (not sed): we need JS regex lookbehind guards and a per-match
// "full identifier" denylist that POSIX sed can't express. Runs across every
// source/doc file (read -> transform -> write), case-sensitive, in ordered
// rule groups so shorter tokens never clobber longer ones.
//
//   Group A  semantic rename (the user-facing benefit)
//   Group B  opaque dispatch-tag retag  it -> val, te -> verr
//   Group C  build-diagnostic codes     IT0xx -> VL0xx, TE0xx -> VE0xx
//
// Safety:
//   - lowercase rules carry (?<![A-Za-z]) so TypeScript's built-in ThisType
//     (ast.KindThisType, ...h-isType) is never touched.
//   - plural-only TypeErrors target leaves singular TypeError / RunTypeError /
//     TypeFormatError (JS + our error record types) alone.
//   - DENY = mion upstream method names referenced in `// mion:...` comments;
//     a match whose full surrounding identifier is on DENY is skipped, so our
//     emitObjectTypeErrors renames but mion's bare emitTypeErrors does not.
//
// Usage:
//   node scripts/migrate-validate-rename.mjs                 # dry-run, all groups
//   node scripts/migrate-validate-rename.mjs --write         # apply
//   node scripts/migrate-validate-rename.mjs --groups=A --write
//
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const WRITE = process.argv.includes('--write');
const groupsArg = (process.argv.find((a) => a.startsWith('--groups=')) || '--groups=ABC').split('=')[1];
const GROUPS = new Set(groupsArg.toUpperCase().split(''));

// ---- file selection ---------------------------------------------------------
const ALLOWED_EXT = new Set(['.go', '.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '.cjs', '.md']);
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', 'dist', 'third_party', 'bin', '.nx', 'coverage', 'gendocs']);
// fully generated or upstream-describing — handled separately, never auto-renamed
const EXCLUDE_PATHS = new Set(['packages/vite-plugin-runtypes/src/runtypes-constants.generated.ts']);
const EXCLUDE_PREFIXES = ['.claude/skills/'];
// this script names every token verbatim; renaming itself would corrupt the rules
const SELF = path.relative(ROOT, fileURLToPath(import.meta.url));

// Never-rename identifiers: mion upstream method names (provenance comments)
// and tsgo AST predicates that merely start with `Is`+`Type…` (e.g.
// ast.IsTypeReferenceNode is "is this a TypeReference node", not our isType).
const DENY = new Set(['emitIsType', 'emitTypeErrors', 'emitIsTypeErrors', 'IsTypeReferenceNode']);
const IDENT = /[A-Za-z0-9_]/;

function fullIdentifier(text, start, end) {
  let i = start;
  let j = end;
  while (i > 0 && IDENT.test(text[i - 1])) i--;
  while (j < text.length && IDENT.test(text[j])) j++;
  return text.slice(i, j);
}

// A rule: {name, re (global), rep (string|fn), deny?: bool}
function makeRules() {
  const A = [
    {name: 'TypeErrors->ValidationErrors', re: /TypeErrors/g, rep: 'ValidationErrors', deny: true},
    {name: 'typeErrors->validationErrors', re: /(?<![A-Za-z])typeErrors/g, rep: 'validationErrors'},
    {name: 'IsType->Validate', re: /IsType/g, rep: 'Validate', deny: true},
    {name: 'isType->validate', re: /(?<![A-Za-z])isType/g, rep: 'validate'},
    // all-caps convenience-export names (gen-ts-constants emits UPPER(key)_*) + kebab doc refs
    {name: 'ISTYPE->VALIDATE', re: /ISTYPE/g, rep: 'VALIDATE'},
    {name: 'TYPEERRORS->VALIDATIONERRORS', re: /TYPEERRORS/g, rep: 'VALIDATIONERRORS'},
    {name: 'IS-TYPE->VALIDATE', re: /IS-TYPE/g, rep: 'VALIDATE'},
  ];
  const B = [
    // tag-derived Go identifiers (exact)
    {name: 'CrossFamilyItRoots', re: /CrossFamilyItRoots/g, rep: 'CrossFamilyValRoots'},
    {name: 'itKey', re: /\bitKey\b/g, rep: 'valKey'},
    // var prefixes (longer first)
    {name: 'g_it_', re: /(?<![A-Za-z])g_it_/g, rep: 'g_val_'},
    {name: 'g_te_', re: /(?<![A-Za-z])g_te_/g, rep: 'g_verr_'},
    // variant suffix itNA_ before the bare it_
    {name: 'itNA', re: /(?<![A-Za-z])itNA/g, rep: 'valNA'},
    // inner-fn / cross-family prefixes
    {name: 'it_', re: /(?<![A-Za-z])it_/g, rep: 'val_'},
    {name: 'te_', re: /(?<![A-Za-z])te_/g, rep: 'verr_'},
    // quoted tag-as-disk-filename: "it.json" -> "val.json" (basename is the Tag)
    {name: '"it.json"', re: /(['"])it\.json\1/g, rep: '$1val.json$1'},
    {name: '"te.json"', re: /(['"])te\.json\1/g, rep: '$1verr.json$1'},
    // quoted bare tags: 'it' "it" (FnKey/FamilyTag/Tag/fnID/fallbackPrefix/markers/test asserts)
    {name: "'it'", re: /(['"])it\1/g, rep: '$1val$1'},
    {name: "'te'", re: /(['"])te\1/g, rep: '$1verr$1'},
  ];
  const C = [
    {name: 'IT0xx->VL0xx', re: /\bIT0\d\d\b/g, rep: (m) => 'VL' + m.slice(2)},
    {name: 'TE0xx->VE0xx', re: /\bTE0\d\d\b/g, rep: (m) => 'VE' + m.slice(2)},
    {name: 'CodeIS*', re: /\bCodeIS(?=[A-Z])/g, rep: 'CodeVL'},
    {name: 'CodeTE*', re: /\bCodeTE(?=[A-Z])/g, rep: 'CodeVE'},
  ];
  const rules = [];
  if (GROUPS.has('A')) rules.push(...A);
  if (GROUPS.has('B')) rules.push(...B);
  if (GROUPS.has('C')) rules.push(...C);
  return rules;
}

function applyRule(text, rule, tally) {
  const rep = rule.rep;
  // Fast path: no denylist + plain string replacement. Native String.replace
  // handles $1 backrefs (the quoted-tag rules rely on that).
  if (!rule.deny && typeof rep === 'string') {
    const n = (text.match(rule.re) || []).length;
    if (n) tally[rule.name] = (tally[rule.name] || 0) + n;
    return text.replace(rule.re, rep);
  }
  // Callback path: denylist check and/or function replacement. None of these
  // rules use $1 backrefs, so returning `rep` verbatim is correct.
  return text.replace(rule.re, (...args) => {
    const whole = args[args.length - 1];
    const offset = args[args.length - 2];
    const m = args[0];
    if (rule.deny) {
      const id = fullIdentifier(whole, offset, offset + m.length);
      if (DENY.has(id)) return m;
    }
    tally[rule.name] = (tally[rule.name] || 0) + 1;
    return typeof rep === 'function' ? rep(...args) : rep;
  });
}

function walk(dir, out) {
  for (const ent of fs.readdirSync(dir, {withFileTypes: true})) {
    const full = path.join(dir, ent.name);
    const rel = path.relative(ROOT, full);
    if (ent.isDirectory()) {
      if (EXCLUDE_DIRS.has(ent.name)) continue;
      walk(full, out);
    } else if (ent.isFile()) {
      if (!ALLOWED_EXT.has(path.extname(ent.name))) continue;
      if (rel === SELF || EXCLUDE_PATHS.has(rel)) continue;
      if (EXCLUDE_PREFIXES.some((p) => rel.startsWith(p))) continue;
      out.push(full);
    }
  }
}

const rules = makeRules();
const files = [];
walk(ROOT, files);

const tally = {};
let changedFiles = 0;
for (const file of files) {
  const before = fs.readFileSync(file, 'utf8');
  let after = before;
  for (const rule of rules) after = applyRule(after, rule, tally);
  if (after !== before) {
    changedFiles++;
    if (WRITE) fs.writeFileSync(file, after);
  }
}

console.log(`groups=${[...GROUPS].join('')} mode=${WRITE ? 'WRITE' : 'dry-run'} files-scanned=${files.length} files-changed=${changedFiles}`);
console.log('replacements per rule:');
for (const r of rules) console.log(`  ${String(tally[r.name] || 0).padStart(6)}  ${r.name}`);
if (!WRITE) console.log('\n(dry-run — re-run with --write to apply)');
