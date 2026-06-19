// diff_extra.mjs — EXTRA differential cases used to harden parity confidence:
// emits testdata/extra/cases.json the Go differential test (extra_test.go)
// consumes. Same byte-offset construction as gen_golden.mjs but covers more
// multibyte / boundary permutations. Run from the repo root:
//   node internal/compiled/transform/testdata/extra/diff_extra.mjs
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {rewrite} from '../../../../../packages/runtypes-devtools/dist/rewrite.js';

const here = dirname(fileURLToPath(import.meta.url));

function byteIndexOf(code, needle, fromCharIndex = 0) {
  const charIndex = code.indexOf(needle, fromCharIndex);
  if (charIndex < 0) throw new Error(`needle ${JSON.stringify(needle)} not found in ${JSON.stringify(code)}`);
  return Buffer.byteLength(code.slice(0, charIndex), 'utf8');
}
const resolver = (sites, replacements) => ({scanFiles: async () => ({sites, replacements})});

const inputs = [];

// CRLF line endings (\r\n) — the \r is an ordinary non-word char; split is on \n.
inputs.push({
  name: 'crlf',
  file: 'a.ts',
  code: `const a = 1;\r\nconst id = getRunTypeId<string>();\r\n`,
  build: (code) => [[{file: 'a.ts', pos: byteIndexOf(code, ')', code.indexOf('getRunTypeId')), id: 'Crlf001', paramIndex: 1, argsCount: 0}], []],
});

// Tabs + leading whitespace before the call.
inputs.push({
  name: 'tabs',
  file: 'a.ts',
  code: `\t\tconst id = getRunTypeId<string>();\n`,
  build: (code) => [[{file: 'a.ts', pos: byteIndexOf(code, ')'), id: 'Tab0001', paramIndex: 1, argsCount: 0}], []],
});

// Two emoji + two em-dashes scattered, multiple sites across lines.
inputs.push({
  name: 'heavy_multibyte',
  file: 'a.ts',
  code: `// 🦄 — 🚀 — header\nconst a = getRunTypeId<string>();\n// más\nconst b = getRunTypeId<number>();\n`,
  build: (code) => {
    const p1 = byteIndexOf(code, ')', code.indexOf('getRunTypeId'));
    const c1 = code.indexOf(')');
    const p2 = byteIndexOf(code, ')', c1 + 1);
    return [[
      {file: 'a.ts', pos: p1, id: 'Mb00001', paramIndex: 1, argsCount: 0},
      {file: 'a.ts', pos: p2, id: 'Mb00002', paramIndex: 1, argsCount: 0},
    ], []];
  },
});

// Replacement whose span contains multibyte chars (em-dash inside the replaced text).
inputs.push({
  name: 'replace_over_multibyte',
  file: 'a.ts',
  code: `registerPureFnFactory('ns::f', (x) => x /* — */);\n`,
  build: (code) => {
    const inner = '(x) => x /* — */';
    const start = byteIndexOf(code, inner);
    const end = start + Buffer.byteLength(inner, 'utf8');
    return [[], [{file: 'a.ts', start, end, text: '__rt_pf_ns_f', importFrom: 'virtual:rt/pf/ns/f.js'}]];
  },
});

// paramIndex 3, argsCount 1 → two `undefined` pads + leading comma.
inputs.push({
  name: 'big_padding',
  file: 'a.ts',
  code: `const v = createGetValidationErrors<T>(opts);\n`,
  build: (code) => [[{file: 'a.ts', pos: byteIndexOf(code, ')'), id: 'Big0001', paramIndex: 3, argsCount: 1, fnId: 'verr'}], []],
});

// site.module set (allSingle bundle mode) — specifier uses the bundle basename.
inputs.push({
  name: 'bundle_module',
  file: 'a.ts',
  code: `const v = createValidate<T>();\n`,
  build: (code) => [[{file: 'a.ts', pos: byteIndexOf(code, ')'), id: 'Bun0001', paramIndex: 1, argsCount: 0, fnId: 'val', module: 'fns/val'}], []],
});

// Three sites two of which share one specifier? Not for sites (ids differ). Use
// two replacements importing from the SAME specifier to exercise clause dedupe.
inputs.push({
  name: 'dup_specifier',
  file: 'a.ts',
  code: `regA('x', AAA); regB('y', BBB);\n`,
  build: (code) => {
    const s1 = byteIndexOf(code, 'AAA');
    const e1 = s1 + 3;
    const s2 = byteIndexOf(code, 'BBB');
    const e2 = s2 + 3;
    return [[], [
      {file: 'a.ts', start: s1, end: e1, text: '__rt_shared_a', importFrom: 'virtual:rt/shared.js'},
      {file: 'a.ts', start: s2, end: e2, text: '__rt_shared_b', importFrom: 'virtual:rt/shared.js'},
    ]];
  },
});

// Site at end-of-file with NO trailing newline.
inputs.push({
  name: 'no_trailing_newline',
  file: 'a.ts',
  code: `const id = getRunTypeId<string>()`,
  build: (code) => [[{file: 'a.ts', pos: byteIndexOf(code, ')'), id: 'Eof0001', paramIndex: 1, argsCount: 0}], []],
});

// Astral chars in an identifier-adjacent string + a word run right after multibyte.
inputs.push({
  name: 'word_after_astral',
  file: 'a.ts',
  code: `const w = "𝕏abc"; const id = getRunTypeId<string>();\n`,
  build: (code) => [[{file: 'a.ts', pos: byteIndexOf(code, ')', code.indexOf('getRunTypeId')), id: 'Ast0001', paramIndex: 1, argsCount: 0}], []],
});

const out = [];
for (const input of inputs) {
  const [sites, replacements] = input.build(input.code);
  const result = await rewrite(input.file, input.code, resolver(sites, replacements));
  out.push({
    name: input.name,
    file: input.file,
    code: input.code,
    sites,
    replacements,
    expectedCode: result.code,
    expectedMap: result.map ?? null,
  });
}
writeFileSync(join(here, 'cases.json'), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote extra/cases.json with ${out.length} cases`);
