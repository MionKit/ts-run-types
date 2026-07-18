// gen_golden.mjs — generates golden testdata for the Go `transform` package by
// driving the REAL JS rewrite from the built ts-runtypes-devtools dist. The Go
// port (internal/compiler/sourcerewrite) must reproduce these byte-for-byte.
//
// Run from the repo root:  node internal/compiler/sourcerewrite/testdata/gen_golden.mjs
//
// Each case writes testdata/<name>.json = {file, code, sites, replacements,
// expectedCode, expectedMap}. Sites/replacements carry UTF-8 BYTE offsets
// (computed via Buffer.byteLength on substrings) exactly as the resolver emits.
import {writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import {rewrite} from '../../../../packages/ts-runtypes-devtools/dist/rewrite.js';

const here = dirname(fileURLToPath(import.meta.url));

// byteOffsetOf returns the UTF-8 byte offset of the first occurrence of
// `needle` in `code` (optionally past `from`), then advances by `needle`'s own
// byte length — i.e. it returns the byte index of the END of the match, which
// for a close-paren needle ")" is the byte just AFTER it. Sites key on the
// close-paren position; the resolver reports the offset of the ")" itself, so
// for site positions we use `byteIndexOf(code, ')')` (start of the paren).
function byteIndexOf(code, needle, fromCharIndex = 0) {
  const charIndex = code.indexOf(needle, fromCharIndex);
  if (charIndex < 0) throw new Error(`needle ${JSON.stringify(needle)} not found`);
  return Buffer.byteLength(code.slice(0, charIndex), 'utf8');
}

// makeResolver fakes the SiteScanner the real rewrite() awaits.
function makeResolver(sites, replacements) {
  return {scanFiles: async () => ({sites, replacements})};
}

async function emit(name, file, code, sites, replacements) {
  const result = await rewrite(file, code, makeResolver(sites, replacements));
  const out = {
    file,
    code,
    sites,
    replacements,
    expectedCode: result.code,
    expectedMap: result.map ?? null,
  };
  writeFileSync(join(here, `${name}.json`), JSON.stringify(out, null, 2) + '\n');
  console.log(`wrote ${name}.json  (mappings=${result.map ? JSON.stringify(result.map.mappings) : 'none'})`);
}

const cases = [];

// 1. static getRunTypeId<T>() — id only, paramIndex 1, argsCount 0.
//    getRunTypeId<string>()  → reflection site, fnId undefined, bare-id binding.
cases.push(async () => {
  const code = `const id = getRunTypeId<string>();\n`;
  const pos = byteIndexOf(code, ')'); // close paren of the call
  const sites = [{file: 'a.ts', pos, id: 'Abc1234', paramIndex: 1, argsCount: 0}];
  await emit('static_get', 'a.ts', code, sites, []);
});

// 2. reflect getRunTypeId(value) — argsCount 1 (value already supplied),
//    paramIndex 1 so the binding lands as the 2nd arg with a leading comma.
cases.push(async () => {
  const code = `const s = 'hello';\nconst id = getRunTypeId(s);\n`;
  const pos = byteIndexOf(code, ')', code.indexOf('getRunTypeId'));
  const sites = [{file: 'a.ts', pos, id: 'Abc1234', paramIndex: 1, argsCount: 1}];
  await emit('reflect_value', 'a.ts', code, sites, []);
});

// 3. multi-fn array — fnIds:[val,verr], paramIndex 2, argsCount 0. The marker
//    named two families, so the binding is an ARRAY of two bindings.
cases.push(async () => {
  const code = `const schema = createStandardSchema<User>();\n`;
  const pos = byteIndexOf(code, ')');
  const sites = [
    {file: 'a.ts', pos, id: 'Usr9999', paramIndex: 2, argsCount: 0, fnId: 'val', fnIds: ['val', 'verr']},
  ];
  await emit('multi_fn', 'a.ts', code, sites, []);
});

// 4. trailing-comma — trailingComma:true, single createX site. argsCount 1
//    but the existing arg list already ends with a comma, so no leading comma.
cases.push(async () => {
  const code = `const v = createValidate<Foo>({\n  noLiterals: true,\n},);\n`;
  const pos = byteIndexOf(code, ')');
  const sites = [
    {file: 'a.ts', pos, id: 'Foo5678', paramIndex: 1, argsCount: 1, fnId: 'val', trailingComma: true},
  ];
  await emit('trailing_comma', 'a.ts', code, sites, []);
});

// 5. pure-fn Replacement — start<end span edit with importFrom.
cases.push(async () => {
  const code = `registerPureFnFactory('rt::foo', () => 1);\n`;
  const start = byteIndexOf(code, '() => 1');
  const end = start + Buffer.byteLength('() => 1', 'utf8');
  const replacements = [
    {file: 'a.ts', start, end, text: '__rt_pf_rt_foo', importFrom: 'rtmod:/pf/rt/foo.js'},
  ];
  await emit('pure_fn_replace', 'a.ts', code, [], replacements);
});

// 6. zero-width Replacement — start==end (appendLeft of text, no importFrom).
cases.push(async () => {
  const code = `const x = marker(1, 2);\n`;
  const at = byteIndexOf(code, ')');
  const replacements = [{file: 'a.ts', start: at, end: at, text: ', extra'}];
  await emit('zero_width_replace', 'a.ts', code, [], replacements);
});

// 7. multiple sites in one file — two reflection sites on one line + a 2nd line.
cases.push(async () => {
  const code = `const a = getRunTypeId<string>(); const b = getRunTypeId<number>();\nconst c = 3;\n`;
  const firstParen = byteIndexOf(code, ')');
  // second call's close paren: search after the first close paren char index
  const firstParenChar = code.indexOf(')');
  const secondParen = byteIndexOf(code, ')', firstParenChar + 1);
  const sites = [
    {file: 'a.ts', pos: firstParen, id: 'Str1111', paramIndex: 1, argsCount: 0},
    {file: 'a.ts', pos: secondParen, id: 'Num2222', paramIndex: 1, argsCount: 0},
  ];
  await emit('multi_site', 'a.ts', code, sites, []);
});

// 8. multi-line code — site on a later line, with a leading comma (argsCount 1).
cases.push(async () => {
  const code = `// header comment\nimport {createValidate} from 'ts-runtypes';\n\nconst v = createValidate<Bar>(opts);\nexport {v};\n`;
  const pos = byteIndexOf(code, ')', code.indexOf('createValidate<Bar>'));
  const sites = [{file: 'a.ts', pos, id: 'Bar3333', paramIndex: 1, argsCount: 1, fnId: 'val'}];
  await emit('multi_line', 'a.ts', code, sites, []);
});

// 9. MULTIBYTE — a line with an em-dash (U+2014, 3 bytes) and a 🦄 emoji
//    (U+1F984, 4 bytes / 2 UTF-16 units) BEFORE the site so byte != utf16.
cases.push(async () => {
  const code = `// note — about unicorns 🦄 here\nconst id = getRunTypeId<string>();\n`;
  const pos = byteIndexOf(code, ')', code.indexOf('getRunTypeId'));
  const sites = [{file: 'a.ts', pos, id: 'Uni4444', paramIndex: 1, argsCount: 0}];
  await emit('multibyte', 'a.ts', code, sites, []);
});

// 10. MULTIBYTE inline — em-dash + emoji on the SAME line as the site, before
//     the call, so the column math past the multibyte chars is exercised.
cases.push(async () => {
  const code = `const x = '🦄 — y'; const id = getRunTypeId<string>();\n`;
  const pos = byteIndexOf(code, ')', code.indexOf('getRunTypeId'));
  const sites = [{file: 'a.ts', pos, id: 'Inl5555', paramIndex: 1, argsCount: 0}];
  await emit('multibyte_inline', 'a.ts', code, sites, []);
});

// 11. mixed sites + replacement in one file (both edit kinds + import dedupe).
cases.push(async () => {
  const code = `registerPureFnFactory('rt::foo', () => 1);\nconst v = createValidate<Baz>();\n`;
  const start = byteIndexOf(code, '() => 1');
  const end = start + Buffer.byteLength('() => 1', 'utf8');
  const sitePos = byteIndexOf(code, ')', code.indexOf('createValidate<Baz>'));
  const sites = [{file: 'a.ts', pos: sitePos, id: 'Baz6666', paramIndex: 1, argsCount: 0, fnId: 'val'}];
  const replacements = [
    {file: 'a.ts', start, end, text: '__rt_pf_rt_foo', importFrom: 'rtmod:/pf/rt/foo.js'},
  ];
  await emit('mixed', 'a.ts', code, sites, replacements);
});

// 12. padding — paramIndex 2 with argsCount 0 → one `undefined` placeholder.
cases.push(async () => {
  const code = `const v = createValidate<Pad>();\n`;
  const pos = byteIndexOf(code, ')');
  const sites = [{file: 'a.ts', pos, id: 'Pad7777', paramIndex: 2, argsCount: 0, fnId: 'val'}];
  await emit('padding', 'a.ts', code, sites, []);
});

// 13. empty (no sites, no replacements) — rewrite returns {code, no map}.
cases.push(async () => {
  const code = `const noop = 1;\n`;
  await emit('empty', 'a.ts', code, [], []);
});

for (const run of cases) await run();
console.log(`\nGenerated ${cases.length} golden cases.`);
