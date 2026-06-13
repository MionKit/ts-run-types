import {EditBuffer, type SourceMap} from './edit-buffer.ts';
import type {SiteScanner} from './scan-batcher.ts';
import type {Replacement, Site} from './protocol.ts';
import {ENTRY_BINDING_PREFIX, ENTRY_MODULE_SUFFIX, VIRTUAL_MODULE_PREFIX} from './runtypes-constants.generated.ts';

// Rewritten carries the patched source + the sites and replacements
// the Go binary returned. `sites[i].pos` is the byte offset of the
// close-paren in the ORIGINAL source; replacements are also against
// the original source. Consumers using these positions after applying
// `code` must account for the offset shift introduced by the rewrites
// (including the import block inserted at offset 0). `map` carries the
// EditBuffer-generated source map for the edits (absent when the file
// had nothing to rewrite).
export interface Rewritten {
  code: string;
  map?: SourceMap;
  sites: Site[];
  replacements: Replacement[];
}

// rewrite asks the resolver to scan the given file and apply three kinds
// of edits derived from the Go binary's response:
//
//   1. Site insertions: the resolved entry-module BINDING is slipped in
//      just before each call's closing `)` — the imported tuple, not an
//      id string.
//   2. Replacements: byte-range substitutions (e.g. the pure-fn
//      extractor swaps the factory argument of every
//      `registerPureFnFactory(ns, fn, factory)` call for the pure fn's
//      entry-module binding; `importFrom` names the module).
//   3. One single-line import block at offset 0 covering every binding the
//      edits above reference, deduped per specifier (all statements joined
//      on ONE line, so the original source shifts by exactly 1 line):
//      `import {__rt_<basename>} from 'virtual:rt/<basename>.js';` — every
//      entry module exports under its binding name, so clauses never rename.
//
// Edits are applied through an EditBuffer (our in-house string editor +
// source-map generator, see edit-buffer.ts) so transform() can hand Vite a
// real source map — original positions survive the injected imports and
// bindings. Positions from the resolver are UTF-8 BYTE offsets (tsgo
// internally indexes its source files by byte) while the EditBuffer indexes
// by UTF-16 code units, so every resolver offset goes through
// makeByteToChar before touching the buffer — never index the JS
// string with a resolver offset directly; multibyte source characters
// (an em-dash in a comment is enough) would misalign the inserted hash.
export async function rewrite(file: string, code: string, resolver: SiteScanner): Promise<Rewritten> {
  const result = await resolver.scanFiles([file]);
  const sites = result.sites;
  const replacements = result.replacements ?? [];
  if (sites.length === 0 && replacements.length === 0) {
    return {code, sites, replacements};
  }

  const byteOffsets = [...sites.map((site) => site.pos), ...replacements.flatMap((rep) => [rep.start, rep.end])];
  const toChar = makeByteToChar(code, byteOffsets);
  const editBuffer = new EditBuffer(code);
  // Sites are zero-width insertions keyed on `pos`; replacements are span
  // edits keyed on `start`/`end`. The EditBuffer resolves every edit against
  // ORIGINAL coordinates, so application order is irrelevant (the old
  // Buffer-based path needed an explicit right-to-left sort).
  for (const site of sites) {
    editBuffer.appendLeft(toChar(site.pos), buildInsertion(site));
  }
  for (const rep of replacements) {
    if (rep.start === rep.end) editBuffer.appendLeft(toChar(rep.start), rep.text);
    else editBuffer.update(toChar(rep.start), toChar(rep.end), rep.text);
  }
  const importBlock = buildImportBlock(sites, replacements);
  if (importBlock !== '') editBuffer.prepend(importBlock);

  // The map uses boundary-granular segments (one per token run), which keeps
  // it small while still relocating positions past the injected mid-line bindings.
  const map = editBuffer.generateMap({source: file, includeContent: true});
  return {code: editBuffer.toString(), map, sites, replacements};
}

// makeByteToChar converts resolver UTF-8 byte offsets to the UTF-16
// code-unit indices the EditBuffer expects. Pure-ASCII sources (the common
// case) short-circuit to identity; otherwise one code-point walk maps
// exactly the offsets the edits need. Resolver offsets always land on
// code-point boundaries, so the mapping is exact.
function makeByteToChar(code: string, byteOffsets: number[]): (byteOffset: number) => number {
  if (Buffer.byteLength(code, 'utf8') === code.length) return (byteOffset) => byteOffset;
  const sorted = [...new Set(byteOffsets)].sort((a, b) => a - b);
  const byChar = new Map<number, number>();
  let pending = 0;
  let byte = 0;
  let unit = 0;
  for (const char of code) {
    while (pending < sorted.length && sorted[pending] <= byte) {
      byChar.set(sorted[pending], unit);
      pending++;
    }
    if (pending === sorted.length) break;
    const codePoint = char.codePointAt(0) as number;
    byte += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    unit += char.length;
  }
  for (; pending < sorted.length; pending++) byChar.set(sorted[pending], unit);
  return (byteOffset) => byChar.get(byteOffset) ?? byteOffset;
}

// siteBasename derives the entry-module basename a site imports: the
// `<fnHash>_<typeId>` cache key for createX sites (InjectTypeFnArgs), the
// bare typeId for reflection sites (InjectRunTypeId). Both are short
// alphanumeric hashes, so the basename doubles as an identifier-safe
// binding suffix.
function siteBasename(site: Site): string {
  return site.fnId ? `${site.fnId}_${site.id}` : site.id;
}

// siteBinding is the import-binding identifier a site's insertion references —
// also the entry module's export name (one name binds the entry everywhere).
function siteBinding(site: Site): string {
  return ENTRY_BINDING_PREFIX + siteBasename(site);
}

// buildImportBlock collects every entry-module import the rewritten file
// needs and renders the deduped import statements as a SINGLE physical line.
// One clause shape everywhere: every module — per-entry or bundle — exports
// each entry under its binding name, so clauses import it directly
// (`{__rt_X}`, never renamed); only the specifier differs (the bundle when
// `site.module` is stamped, the entry's own module otherwise). Bundled sites
// dedupe into ONE import statement per bundle specifier with sorted clauses.
// Deterministic order (sorted by specifier, clauses sorted within) keeps
// rewrites byte-stable. The source map relocates original positions past the
// block either way; keeping it on one physical line just keeps the rewritten
// source readable and the raw (pre-map) line drift at 1.
function buildImportBlock(sites: Site[], replacements: Replacement[]): string {
  const bySpecifier = new Map<string, Set<string>>();
  const addClause = (specifier: string, clause: string) => {
    let clauses = bySpecifier.get(specifier);
    if (!clauses) bySpecifier.set(specifier, (clauses = new Set()));
    clauses.add(clause);
  };
  for (const site of sites) {
    if (!site.id) continue;
    const specifier = VIRTUAL_MODULE_PREFIX + (site.module || siteBasename(site)) + ENTRY_MODULE_SUFFIX;
    addClause(specifier, siteBinding(site));
  }
  for (const replacement of replacements) {
    if (!replacement.importFrom) continue;
    addClause(replacement.importFrom, replacement.text);
  }
  if (bySpecifier.size === 0) return '';
  const specifiers = [...bySpecifier.keys()].sort();
  const statements = specifiers.map(
    (specifier) => `import {${[...bySpecifier.get(specifier)!].sort().join(', ')}} from '${specifier}';`
  );
  return statements.join(' ') + '\n';
}

// buildInsertion produces the text to splice in just before the call's
// closing `)`. The result accounts for two variables:
//   - existing argument count (do we need a leading comma?)
//   - whether earlier optional slots need `undefined` placeholders so the
//     binding lands at the right paramIndex.
function buildInsertion(s: Site): string {
  const argsCount = s.argsCount ?? 0;
  const paramIndex = s.paramIndex ?? argsCount;
  const padding = Math.max(0, paramIndex - argsCount);
  const parts: string[] = [];
  for (let i = 0; i < padding; i++) parts.push('undefined');
  // Every site — createX (InjectTypeFnArgs) and reflection (InjectRunTypeId)
  // alike — receives its entry-module tuple binding. The tuple is
  // self-describing (slot 3 is the cache key), so no id strings ride along.
  parts.push(siteBinding(s));
  const body = parts.join(', ');
  return argsCount > 0 ? `, ${body}` : body;
}
