#!/usr/bin/env node
// One-off generator: walks SERIALIZATION_SPEC cases in
// packages/ts-go-run-types/test/suites/serialization-suite.ts and
// inserts `binaryEncoder` + `binaryDecoder` thunks derived from each
// case's `unsafeEncoder` thunk. The thunk body (type setup + final
// `createJsonEncoder<T>(...)` call) is copied verbatim; only the
// factory expression is swapped to `createBinaryEncoder<T>()` /
// `createBinaryDecoder<T>()`. The marker plugin needs the type at
// every call site so we can't share.
//
// Handles two unsafeEncoder shapes:
//   - block body: `() => { ...stmts...; return createJsonEncoder<T>(...); }`
//   - expression body: `() => createJsonEncoder<T>(...)` (possibly
//     multi-line when the type literal is large)
//
// Idempotent: cases that already have a `binaryEncoder:` line are
// skipped untouched.

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const target = path.resolve(here, '../packages/ts-go-run-types/test/suites/serialization-suite.ts');
const src = fs.readFileSync(target, 'utf8');
const lines = src.split('\n');

const out = [];
let i = 0;

const CASE_OPEN_RE = /^( {4})([a-zA-Z_][a-zA-Z_0-9]*): \{$/;
const CASE_CLOSE_RE = /^ {4}\},$/;

let skipped = [];
let inserted = 0;

while (i < lines.length) {
  const line = lines[i];
  if (!CASE_OPEN_RE.test(line)) {
    out.push(line);
    i++;
    continue;
  }
  // Collect the full case block (case open through matching close).
  const caseLines = [line];
  i++;
  while (i < lines.length) {
    caseLines.push(lines[i]);
    i++;
    if (CASE_CLOSE_RE.test(lines[i - 1])) break;
  }
  if (caseLines.some((l) => /^ {6}binaryEncoder:/.test(l))) {
    out.push(...caseLines);
    continue;
  }
  const unsafeRange = findThunkRange(caseLines, /^ {6}unsafeEncoder: /);
  if (!unsafeRange) {
    skipped.push(`no unsafeEncoder: ${caseLines[0].trim()}`);
    out.push(...caseLines);
    continue;
  }
  const unsafeThunkLines = caseLines.slice(unsafeRange.start, unsafeRange.end + 1);
  const thunkText = unsafeThunkLines.join('\n');
  const typeParam = extractTypeParam(thunkText, 'createJsonEncoder');
  if (typeParam === null) {
    skipped.push(`no type param: ${caseLines[0].trim()}`);
    out.push(...caseLines);
    continue;
  }
  // Build the two binary thunks by cloning the unsafeEncoder lines and
  // swapping the factory call.
  const binaryEncoderThunk = buildBinaryThunk(unsafeThunkLines, 'binaryEncoder', `createBinaryEncoder<${typeParam}>()`);
  const binaryDecoderThunk = buildBinaryThunk(unsafeThunkLines, 'binaryDecoder', `createBinaryDecoder<${typeParam}>()`);
  // Insert after the unsafeDecoder if present, else after unsafeEncoder.
  const decoderRange = findThunkRange(caseLines, /^ {6}unsafeDecoder: /);
  const insertAfter = decoderRange ? decoderRange.end : unsafeRange.end;
  const newCase = [
    ...caseLines.slice(0, insertAfter + 1),
    ...binaryEncoderThunk,
    ...binaryDecoderThunk,
    ...caseLines.slice(insertAfter + 1),
  ];
  out.push(...newCase);
  inserted++;
}

fs.writeFileSync(target, out.join('\n'));
console.log(`Inserted binary thunks into ${inserted} cases.`);
if (skipped.length) {
  console.log(`Skipped ${skipped.length} cases:`);
  for (const s of skipped) console.log(`  - ${s}`);
}

// ---------- helpers ----------

// Find the line range [start, end] that holds a thunk matching headRe.
// Handles both block-body (`() => { ... }`) and expression-body
// (`() => createJsonEncoder<T>(...)` possibly spanning multiple lines)
// forms.
function findThunkRange(caseLines, headRe) {
  const start = caseLines.findIndex((l) => headRe.test(l));
  if (start === -1) return null;
  const head = caseLines[start];
  // Block body — starts with `=> {` somewhere on the head line.
  // Track brace depth to find the matching `},` close at indent 6.
  if (/=>\s*\{/.test(head)) {
    let depth = countOpenBraces(head) - countCloseBraces(head);
    let end = start;
    while (depth > 0 && end + 1 < caseLines.length) {
      end++;
      depth += countOpenBraces(caseLines[end]) - countCloseBraces(caseLines[end]);
    }
    return {start, end};
  }
  // Expression body — accumulate lines until the bracket/paren depth
  // returns to zero AND the line ends with `,` (the thunk terminator
  // in the case object literal). We track parens, square brackets,
  // and braces (object literals like `{strategy: 'mutate', ...}`),
  // but NOT angle brackets — `Map<string, number>` reads as
  // `Map< string, number >` where the comma is mid-expression.
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  let end = start;
  for (let k = start; k < caseLines.length; k++) {
    const ch = caseLines[k];
    for (const c of stripStringsAndComments(ch)) {
      if (c === '(') parenDepth++;
      else if (c === ')') parenDepth--;
      else if (c === '{') braceDepth++;
      else if (c === '}') braceDepth--;
      else if (c === '[') bracketDepth++;
      else if (c === ']') bracketDepth--;
    }
    if (parenDepth === 0 && braceDepth === 0 && bracketDepth === 0 && /,\s*$/.test(ch)) {
      end = k;
      return {start, end};
    }
  }
  return null;
}

// Strip string literals and line comments so brace/paren counts don't
// get fooled by characters inside `"..."`, `'...'`, `` `...` ``, or
// `// ...`. Block comments aren't expected in this file's case
// definitions, so we don't bother with `/* */`.
function stripStringsAndComments(line) {
  let out = '';
  let inStr = null;
  for (let k = 0; k < line.length; k++) {
    const c = line[k];
    if (inStr) {
      if (c === '\\') {
        k++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    if (c === '/' && line[k + 1] === '/') break;
    out += c;
  }
  return out;
}

function countOpenBraces(line) {
  return [...stripStringsAndComments(line)].filter((c) => c === '{').length;
}
function countCloseBraces(line) {
  return [...stripStringsAndComments(line)].filter((c) => c === '}').length;
}

// Extract the `<T>` immediately following `<callName>` in the text,
// counting angle brackets so nested generics (`Parameters<typeof fn>`,
// `Map<string, T>`) work. String literals are skipped so a `>` inside
// `"weird prop name \n?>'\\\t\r"` (a real key in one of the cases)
// doesn't terminate the count prematurely.
function extractTypeParam(text, callName) {
  const idx = text.indexOf(callName + '<');
  if (idx === -1) return null;
  let depth = 0;
  let start = -1;
  let inStr = null;
  for (let k = idx + callName.length; k < text.length; k++) {
    const c = text[k];
    if (inStr) {
      if (c === '\\') {
        k++;
        continue;
      }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inStr = c;
      continue;
    }
    // Skip `=>` (arrow function in type position, e.g. `(x: T) => U`).
    // The `>` half would otherwise close the outer generic.
    if (c === '=' && text[k + 1] === '>') {
      k++;
      continue;
    }
    if (c === '<') {
      depth++;
      if (depth === 1) start = k + 1;
    } else if (c === '>') {
      depth--;
      if (depth === 0) return text.slice(start, k);
    }
  }
  return null;
}

// Build a binary thunk by cloning unsafeEncoder lines and replacing the
// `createJsonEncoder<T>(...)` call with the new factory expression.
// Output uses the same indentation as the unsafe thunk.
function buildBinaryThunk(unsafeThunkLines, keyName, factoryExpr) {
  const head = unsafeThunkLines[0];
  const tail = unsafeThunkLines.slice(1);
  const isBlock = /=>\s*\{/.test(head);
  if (isBlock) {
    // Block body — replace the `return createJsonEncoder<...>(...)`
    // line, leave everything else untouched. The thunk header carries
    // the key name (`unsafeEncoder:` → `<keyName>:`), regenerate it
    // from scratch to keep indentation precise.
    const newHead = head.replace(/unsafeEncoder: \(\) =>\s*\{/, `${keyName}: () => {`);
    const newTail = tail.map((l) => {
      if (/createJsonEncoder</.test(l)) {
        // `        return createJsonEncoder<T>(args);` → `        return <factoryExpr>;`
        return l.replace(/return createJsonEncoder<[\s\S]*?>\([\s\S]*?\);/, `return ${factoryExpr};`);
      }
      return l;
    });
    return [newHead, ...newTail];
  }
  // Expression body. Two sub-shapes:
  //   single-line:  `      unsafeEncoder: () => createJsonEncoder<T>(args),`
  //   multi-line:   `      unsafeEncoder: () =>\n        createJsonEncoder<{\n  ...lines...\n        }>(args),`
  if (unsafeThunkLines.length === 1) {
    // Replace the entire body expression with the binary factory.
    const replaced = head.replace(
      /unsafeEncoder: \(\) => createJsonEncoder<[\s\S]*?>\([\s\S]*?\),/,
      `${keyName}: () => ${factoryExpr},`
    );
    return [replaced];
  }
  // Multi-line expression — collapse the whole thing into a one-liner.
  // The binary factory takes no options, so the multi-line type-literal
  // wrap is unnecessary; we recreate the type from the captured
  // typeParam and emit a single line.
  // factoryExpr already carries `createBinaryEncoder<TYPE>()`.
  const indentMatch = head.match(/^( *)/);
  const indent = indentMatch ? indentMatch[1] : '      ';
  return [`${indent}${keyName}: () => ${factoryExpr},`];
}
