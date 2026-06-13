// Type-checking cost benchmark — measures TypeScript **type instantiations**
// incurred to resolve the static type each library produces.
//
// For every case it assembles a tiny self-contained .ts probe per FORM and
// compiles it in isolation through the TypeScript compiler API, reading
// `program.getInstantiationCount()` (baseline-subtracted so the number is the
// marginal cost of resolving that case's type, not the import scaffold):
//
//   ts-go (type)    type T = <the TS type>;                 let x!: T;
//   ts-go (schema)  const s = RT.…;  type T = Static<typeof s>;     let x!: T;
//   zod             const s = z.…;   type T = z.infer<typeof s>;    let x!: T;
//   typebox         const s = Type.…; type T = Static<typeof s>;    let x!: T;
//   ajv             — (JSON Schema has no static type inference)
//
// The probe sources are EXTRACTED (TS compiler API) from the real code:
//   - ts-go (type):   the `createValidate<TYPE>()` type argument in each suite
//                     case's `validate` thunk.
//   - ts-go (schema): the `createValidate(EXPR)` argument in `validateSchema`.
//   - zod / typebox:  the `c(EXPR)` argument in src/competitors/{zod,typebox}.ts.
// so the snippets are the exact types/schemas the runtime benchmark uses.

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const SRC = path.join(HERE, 'src');
const PROBE = path.join(SRC, '__typecost_probe.ts');

const OPTIONS = {
  strict: true,
  target: ts.ScriptTarget.ESNext,
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  noEmit: true,
  skipLibCheck: true,
  noUnusedLocals: false,
  noUnusedParameters: false,
  types: [],
  // esnext.full bundles the full standard lib (incl. Temporal where the TS
  // version ships it); cases whose types reference globals this TS lacks (e.g.
  // Temporal on older TS) simply report "err" and are excluded from totals.
  lib: ['lib.esnext.full.d.ts'],
};

// ── source extraction ───────────────────────────────────────────────────────

const read = (f) => fs.readFileSync(f, 'utf8');
const sf = (f) => ts.createSourceFile(f, read(f), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

/** Import declarations whose specifier is a bare package (not relative). */
function bareImports(source) {
  const out = [];
  source.forEachChild((n) => {
    if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier) && !n.moduleSpecifier.text.startsWith('.')) {
      out.push(n.getText(source));
    }
  });
  return out;
}

/** Strip `as const` / `satisfies X` / parentheses to reach the wrapped node. */
function unwrapExpr(node) {
  while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))) {
    node = node.expression;
  }
  return node;
}

/** From a suite file: {group, cases: {name: {typeText, schemaText|null}}, imports}. */
function extractSuiteFile(file) {
  const source = sf(file);
  const imports = bareImports(source);
  const groups = [];
  source.forEachChild((n) => {
    if (!ts.isVariableStatement(n)) return;
    for (const decl of n.declarationList.declarations) {
      const init = unwrapExpr(decl.initializer);
      if (!init || !ts.isObjectLiteralExpression(init)) continue;
      const group = decl.name.getText(source);
      const cases = {};
      for (const prop of init.properties) {
        if (!ts.isPropertyAssignment(prop) || !ts.isObjectLiteralExpression(prop.initializer)) continue;
        const name = prop.name.getText(source).replace(/['"]/g, '');
        let typeText = null;
        let schemaText = null;
        for (const member of prop.initializer.properties) {
          if (!ts.isPropertyAssignment(member)) continue;
          const key = member.name.getText(source);
          const call = unwrapThunkCall(member.initializer);
          if (!call) continue;
          const callee = call.expression.getText(source);
          if (key === 'validate' && callee === 'createValidate' && call.typeArguments?.length) {
            typeText = call.typeArguments[0].getText(source);
          } else if (key === 'validateSchema' && callee === 'createValidate' && call.arguments.length) {
            schemaText = call.arguments[0].getText(source);
          }
        }
        if (typeText || schemaText) cases[name] = {typeText, schemaText};
      }
      if (Object.keys(cases).length) groups.push({group, cases, imports});
    }
  });
  return groups;
}

/** `() => createValidate<…>()` | `() => createValidate(…)` → the call node. */
function unwrapThunkCall(node) {
  if (!ts.isArrowFunction(node)) return null;
  let body = node.body;
  if (ts.isBlock(body)) {
    const ret = body.statements.find((s) => ts.isReturnStatement(s));
    body = ret?.expression;
  }
  return body && ts.isCallExpression(body) ? body : null;
}

/** Competitor map file: {preamble, entries: {key: exprText}}. */
function extractCompetitor(file, mapName) {
  const source = sf(file);
  const preamble = [];
  const entries = {};
  // preamble: bare imports + every top-level `const` that isn't the map itself
  source.forEachChild((n) => {
    if (ts.isImportDeclaration(n)) {
      if (ts.isStringLiteral(n.moduleSpecifier) && !n.moduleSpecifier.text.startsWith('.')) preamble.push(n.getText(source));
      return;
    }
    if (ts.isVariableStatement(n)) {
      const isMap = n.declarationList.declarations.some((d) => d.name.getText(source) === mapName);
      if (!isMap) preamble.push(n.getText(source));
    }
  });
  const collect = (objLit) => {
    for (const prop of objLit.properties) {
      if (!ts.isPropertyAssignment(prop)) continue;
      const key = prop.name.getText(source).replace(/['"]/g, '');
      const init = prop.initializer;
      if (ts.isCallExpression(init) && init.expression.getText(source) === 'c' && init.arguments.length) {
        entries[key] = init.arguments[0].getText(source);
      }
    }
  };
  source.forEachChild((n) => {
    if (ts.isVariableStatement(n)) {
      for (const d of n.declarationList.declarations) {
        if (d.name.getText(source) === mapName && d.initializer && ts.isObjectLiteralExpression(d.initializer)) collect(d.initializer);
      }
    }
    // Object.assign(map, {…})
    if (ts.isExpressionStatement(n) && ts.isCallExpression(n.expression)) {
      const ce = n.expression;
      if (ce.expression.getText(source) === 'Object.assign' && ce.arguments[0]?.getText(source) === mapName) {
        const obj = ce.arguments[1];
        if (obj && ts.isObjectLiteralExpression(obj)) collect(obj);
      }
    }
  });
  return {preamble, entries};
}

// ── probe assembly ──────────────────────────────────────────────────────────

const STATIC_IMPORT = `import {type Static} from '@mionjs/ts-go-run-types';`;
const FORCE = `\nlet __x!: __T;\nvoid __x;\n`;

function probeTsType(imports, typeText) {
  return `${imports.join('\n')}\ntype __T = ${typeText};${FORCE}`;
}
function probeTsSchema(imports, exprText) {
  const imps = imports.includes(STATIC_IMPORT) ? imports : [...imports, STATIC_IMPORT];
  return `${imps.join('\n')}\nconst __s = ${exprText};\ntype __T = Static<typeof __s>;${FORCE}`;
}
function probeZod(preamble, exprText) {
  return `${preamble.join('\n')}\nconst __s = ${exprText};\ntype __T = z.infer<typeof __s>;${FORCE}`;
}
function probeTypebox(preamble, exprText) {
  const imp = `import {type Static as __TBStatic} from '@sinclair/typebox';`;
  return `${preamble.join('\n')}\n${imp}\nconst __s = ${exprText};\ntype __T = __TBStatic<typeof __s>;${FORCE}`;
}

// ── isolated compile + instantiation count ──────────────────────────────────

const sfCache = new Map();
let oldProgram;

function compile(text) {
  const host = ts.createCompilerHost(OPTIONS, true);
  const baseGet = host.getSourceFile.bind(host);
  host.getSourceFile = (fn, lang, onErr, should) => {
    if (fn === PROBE) return ts.createSourceFile(fn, text, lang, true, ts.ScriptKind.TS);
    let cached = sfCache.get(fn);
    if (!cached) {
      cached = baseGet(fn, lang, onErr, should);
      if (cached) sfCache.set(fn, cached);
    }
    return cached;
  };
  host.fileExists = (f) => f === PROBE || ts.sys.fileExists(f);
  host.readFile = (f) => (f === PROBE ? text : ts.sys.readFile(f));
  const program = ts.createProgram([PROBE], OPTIONS, host, oldProgram);
  const diags = ts.getPreEmitDiagnostics(program);
  oldProgram = program;
  const errors = diags.filter((d) => d.category === ts.DiagnosticCategory.Error);
  return {count: program.getInstantiationCount(), errors};
}

// baseline = same scaffold/imports with a trivial type → fixed cost to subtract
const baselineCache = new Map();
function baseline(key, text) {
  if (!baselineCache.has(key)) baselineCache.set(key, compile(text).count);
  return baselineCache.get(key);
}

function measure(form, preambleKey, baselineText, probeText) {
  const {count, errors} = compile(probeText);
  if (errors.length) return {status: 'err', n: 0, detail: ts.flattenDiagnosticMessageText(errors[0].messageText, ' ')};
  const base = baseline(`${form}:${preambleKey}`, baselineText);
  return {status: 'ok', n: Math.max(0, count - base)};
}

// ── run ──────────────────────────────────────────────────────────────────────

function main() {
  const suiteFiles = [
    ...globTs(path.join(SRC, 'suites', 'validation')),
    ...globTs(path.join(SRC, 'suites', 'format-validation')),
  ];
  const zod = extractCompetitor(path.join(SRC, 'competitors', 'zod.ts'), 'zodMap');
  const typebox = extractCompetitor(path.join(SRC, 'competitors', 'typebox.ts'), 'typeboxMap');

  const rows = [];
  for (const file of suiteFiles) {
    for (const {group, cases, imports} of extractSuiteFile(file)) {
      const impKey = imports.join('|');
      for (const [name, {typeText, schemaText}] of Object.entries(cases)) {
        const key = `${group}.${name}`;
        const cell = {key, group};

        cell.tsType = typeText
          ? measure('tsType', impKey, probeTsType(imports, 'string'), probeTsType(imports, typeText))
          : {status: 'na'};

        cell.tsSchema = schemaText
          ? measure('tsSchema', impKey, probeTsSchema(imports, 'RT.string()'), probeTsSchema(imports, schemaText))
          : {status: 'na'};

        cell.zod = zod.entries[key]
          ? measure('zod', 'zod', probeZod(zod.preamble, 'z.string()'), probeZod(zod.preamble, zod.entries[key]))
          : {status: 'na'};

        cell.typebox = typebox.entries[key]
          ? measure('typebox', 'typebox', probeTypebox(typebox.preamble, 'Type.String()'), probeTypebox(typebox.preamble, typebox.entries[key]))
          : {status: 'na'};

        rows.push(cell);
      }
    }
  }
  report(rows);
}

function globTs(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'index.ts' && f !== 'types.ts')
    .map((f) => path.join(dir, f));
}

const LIBS = [
  ['ts-go(type)', 'tsType'],
  ['ts-go(schema)', 'tsSchema'],
  ['zod', 'zod'],
  ['typebox', 'typebox'],
];

function report(rows) {
  const padR = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s.padEnd(n));
  const padL = (s, n) => String(s).padStart(n);
  const COL = 15;
  const KEYW = 32;
  console.log('\nType-checking cost — TS type instantiations to resolve each form (baseline-subtracted)\n');
  console.log(padR('case', KEYW) + LIBS.map(([n]) => padL(n, COL)).join(''));
  console.log('-'.repeat(KEYW + COL * LIBS.length));

  const totals = {tsType: 0, tsSchema: 0, zod: 0, typebox: 0};
  const counts = {tsType: 0, tsSchema: 0, zod: 0, typebox: 0};
  let lastGroup = '';
  for (const row of rows) {
    if (row.group !== lastGroup) {
      console.log(`· ${row.group}`);
      lastGroup = row.group;
    }
    let line = padR('  ' + row.key.split('.')[1], KEYW);
    for (const [, field] of LIBS) {
      const cell = row[field];
      if (cell.status === 'ok') {
        totals[field] += cell.n;
        counts[field] += 1;
        line += padL(String(cell.n), COL);
      } else if (cell.status === 'err') {
        line += padL('err', COL);
      } else {
        line += padL('—', COL);
      }
    }
    console.log(line);
  }

  console.log('\nTotals (sum of instantiations / cases measured):');
  for (const [name, field] of LIBS) {
    console.log(`  ${padR(name, 16)} ${padL(totals[field], 9)}  over ${counts[field]} cases`);
  }

  // Fair head-to-head: only cases every form measured cleanly.
  const commonRows = rows.filter((row) => LIBS.every(([, f]) => row[f].status === 'ok'));
  if (commonRows.length) {
    console.log(`\nApples-to-apples — same ${commonRows.length} cases all forms support:`);
    for (const [name, field] of LIBS) {
      const sum = commonRows.reduce((acc, row) => acc + row[field].n, 0);
      console.log(`  ${padR(name, 16)} ${padL(sum, 9)}  (avg ${Math.round(sum / commonRows.length)}/case)`);
    }
  }
  console.log(
    '\nNote: measures the cost for TypeScript to RESOLVE the static type each form\n' +
      'produces (the dominant type-check cost). ts-go(type) is the type-definition\n' +
      'form; ts-go(schema) is the value-first builder + Static<>. ajv has no static\n' +
      'type inference, so it has no column here.',
  );
}

main();
