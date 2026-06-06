// In-process TypeScript-compiler harness for the per-branch `DataOnly<T>`
// instantiation-budget test (dataonly.compile.test.ts).
//
// Each call to `measureDataOnly(snippet)` compiles a self-contained source =
// PREAMBLE + snippet and returns the type-check errors plus the compiler's
// `Instantiations` / `Types` counts (the same numbers `tsc --extendedDiagnostics`
// prints). Asserting an absolute instantiation ceiling per branch turns a
// recursion / exponential-blowup regression into a red test, and the raw number
// is data for tuning an individual branch of the mapping.
//
// The PREAMBLE embeds the REAL `DataOnly` machinery, sliced VERBATIM out of
// src/runtypes/types.ts between the `#region dataonly-extract` markers — so the
// harness can never drift from the shipped type. Temporal is mirrored locally
// (ambient stub + the `DataOnlyNativeExtra` augmentation) so the keep-Temporal
// branch is exercised without pulling the package's module graph (which would
// swamp the instantiation count with unrelated cost).

import * as ts from 'typescript';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

const TYPES_TS = fileURLToPath(new URL('../../src/runtypes/types.ts', import.meta.url));

/** Slice the `DataOnly` machinery out of types.ts between the region markers and
 *  drop the `export` modifiers so it can live in a non-module snippet. **/
function extractDataOnlyRegion(): string {
  const source = readFileSync(TYPES_TS, 'utf8');
  const start = source.indexOf('// #region dataonly-extract');
  const end = source.indexOf('// #endregion dataonly-extract');
  if (start === -1 || end === -1) {
    throw new Error('dataonly-extract region markers not found in src/runtypes/types.ts');
  }
  return source.slice(start, end).replace(/^export (type|interface) /gm, '$1 ');
}

// Minimal ambient `Temporal` surface (mirrors test/temporal-ambient.d.ts) +
// the keep-Temporal augmentation of `DataOnlyNativeExtra`, so the harness
// exercises the same keep-branch the shipped formats/temporal subpath wires up.
const TEMPORAL_PREAMBLE = `
declare namespace Temporal {
  interface Instant { readonly epochMilliseconds: number; toJSON(): string; equals(o: Instant): boolean; }
  interface ZonedDateTime { readonly epochMilliseconds: number; toJSON(): string; }
  interface PlainDate { readonly year: number; readonly month: number; readonly day: number; toJSON(): string; }
  interface PlainTime { readonly hour: number; readonly minute: number; toJSON(): string; }
  interface PlainDateTime { readonly year: number; readonly hour: number; toJSON(): string; }
  interface PlainYearMonth { readonly year: number; readonly month: number; toJSON(): string; }
  interface PlainMonthDay { readonly monthCode: string; readonly day: number; toJSON(): string; }
  interface Duration { readonly years: number; readonly days: number; toJSON(): string; }
}
interface DataOnlyNativeExtra {
  temporalInstant: Temporal.Instant;
  temporalZonedDateTime: Temporal.ZonedDateTime;
  temporalPlainDate: Temporal.PlainDate;
  temporalPlainTime: Temporal.PlainTime;
  temporalPlainDateTime: Temporal.PlainDateTime;
  temporalPlainYearMonth: Temporal.PlainYearMonth;
  temporalPlainMonthDay: Temporal.PlainMonthDay;
  temporalDuration: Temporal.Duration;
}
`;

// Minimal stubs for the handful of DOM/host classes `Native` names, so the
// harness can compile against `lib.es2023` ALONE — dropping `lib.dom` cuts the
// per-case baseline (and bind time) by an order of magnitude, sharpening the
// DataOnly-attributable signal. (The typed arrays / ArrayBuffer / DataView /
// SharedArrayBuffer that `Native` also names live in `lib.es2023` already.)
//
// Each carries a UNIQUE `__host` brand: real DOM types are richly nominal, but a
// loose structural stub (e.g. `{ length: number }`) would be matched by any
// array — sending arrays down the keep-branch instead of the array branch. The
// brand keeps them distinct so the keep-vs-project routing matches production.
const HOST_STUBS = `
interface URL { readonly __host: 'URL' }
interface URLSearchParams { readonly __host: 'URLSearchParams' }
interface Blob { readonly __host: 'Blob' }
interface File { readonly __host: 'File' }
interface FileList { readonly __host: 'FileList' }
interface FormData { readonly __host: 'FormData' }
`;

// Type-level assertion helpers used by the snippets.
const ASSERT_PREAMBLE = `
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
type ExpectFalse<T extends false> = T;
type Assignable<A, B> = A extends B ? true : false;
`;

const PREAMBLE = `${HOST_STUBS}\n${TEMPORAL_PREAMBLE}\n${extractDataOnlyRegion()}\n${ASSERT_PREAMBLE}\n`;
// Line count of everything we prepend — used to rebase diagnostic line numbers.
const PREAMBLE_LINES = PREAMBLE.split('\n').length - 1;

const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2023,
  lib: ['lib.es2023.d.ts'],
  moduleDetection: ts.ModuleDetectionKind.Force, // each snippet is its own module
};

const SNIPPET_FILE = '__dataonly_case__.ts';

// One shared host; lib SourceFiles are parsed once and reused across every
// measurement, so per-case cost is dominated by the snippet itself.
const libCache = new Map<string, ts.SourceFile | undefined>();
const baseHost = ts.createCompilerHost(COMPILER_OPTIONS, true);
let currentSnippet = '';

const host: ts.CompilerHost = {
  ...baseHost,
  getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate) {
    if (fileName === SNIPPET_FILE) {
      return ts.createSourceFile(fileName, currentSnippet, languageVersionOrOptions, true);
    }
    if (libCache.has(fileName)) return libCache.get(fileName);
    const sf = baseHost.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate);
    libCache.set(fileName, sf);
    return sf;
  },
  writeFile() {},
  fileExists: (fileName) => fileName === SNIPPET_FILE || baseHost.fileExists(fileName),
  readFile: (fileName) => (fileName === SNIPPET_FILE ? currentSnippet : baseHost.readFile(fileName)),
};

export interface MeasureResult {
  /** Type-check + syntax errors, with line numbers rebased to the SNIPPET (the
   *  preamble offset removed) so messages point at the case's own code. **/
  errors: string[];
  /** Raw program instantiation count (preamble + lib baseline + the snippet). **/
  instantiations: number;
  /** Instantiations ATTRIBUTABLE TO THE SNIPPET — raw minus the constant
   *  empty-snippet baseline (preamble decls don't instantiate until applied).
   *  This is the per-branch regression metric: it isolates `DataOnly`'s cost
   *  from lib/preamble noise, so a tight absolute ceiling is meaningful. **/
  netInstantiations: number;
  /** Compiler type count (secondary signal). **/
  types: number;
}

function rawMeasure(snippet: string): {errors: string[]; instantiations: number; types: number} {
  currentSnippet = `${PREAMBLE}${snippet}\n`;
  const program = ts.createProgram([SNIPPET_FILE], COMPILER_OPTIONS, host);
  const diagnostics = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()];

  const errors = diagnostics.map((d) => {
    let where = '';
    if (d.file && d.start !== undefined) {
      const {line, character} = d.file.getLineAndCharacterOfPosition(d.start);
      where = `${Math.max(1, line + 1 - PREAMBLE_LINES)}:${character + 1} `;
    }
    return `TS${d.code} ${where}${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
  });

  return {errors, instantiations: program.getInstantiationCount(), types: program.getTypeCount()};
}

// Constant baseline (preamble + lib only). Computed once, lazily, and subtracted
// so per-case numbers reflect only the snippet's own instantiation cost.
let baselineInstantiations = -1;

/** Compile `PREAMBLE + snippet` and report errors + raw/net instantiation counts. **/
export function measureDataOnly(snippet: string): MeasureResult {
  if (baselineInstantiations < 0) baselineInstantiations = rawMeasure('').instantiations;
  const raw = rawMeasure(snippet);
  return {
    errors: raw.errors,
    instantiations: raw.instantiations,
    netInstantiations: raw.instantiations - baselineInstantiations,
    types: raw.types,
  };
}
