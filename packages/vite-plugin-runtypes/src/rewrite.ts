import type {SiteScanner} from './scan-batcher.ts';
import type {Replacement, Site} from './protocol.ts';
import {
  ENTRY_BINDING_PREFIX,
  ENTRY_EXPORT_NAME,
  ENTRY_MODULE_SUFFIX,
  VIRTUAL_MODULE_PREFIX,
} from './runtypes-constants.generated.ts';

// Rewritten carries the patched source + the sites and replacements
// the Go binary returned. `sites[i].pos` is the byte offset of the
// close-paren in the ORIGINAL source; replacements are also against
// the original source. Consumers using these positions after applying
// `code` must account for the offset shift introduced by the rewrites
// (including the import block inserted at offset 0).
export interface Rewritten {
  code: string;
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
//   3. One import block at offset 0 covering every binding the edits
//      above reference, deduped per specifier:
//      `import {e as __rt_<basename>} from 'virtual:rt/<basename>.js';`
//
// All edits are sorted right-to-left by start position and applied in
// one pass — earlier offsets remain valid as we edit (the offset-0
// import block is necessarily applied last). Positions from the
// resolver are UTF-8 BYTE offsets (because tsgo internally indexes its
// source files by byte), so we operate on a Buffer rather than a JS
// string — UTF-16 code-unit math would skew on any multibyte char like
// an em-dash in a comment.
export async function rewrite(file: string, code: string, resolver: SiteScanner): Promise<Rewritten> {
  const result = await resolver.scanFiles([file]);
  const sites = result.sites;
  const replacements = result.replacements ?? [];
  if (sites.length === 0 && replacements.length === 0) {
    return {code, sites, replacements};
  }

  // Sort all edits right-to-left so earlier byte offsets stay valid.
  // Sites are zero-width insertions keyed on `pos`; replacements are
  // span edits keyed on `start`. Both share the same offset space.
  type Edit = {kind: 'site'; pos: number; site: Site} | {kind: 'replace'; start: number; end: number; text: string};
  const edits: Edit[] = [
    ...sites.map<Edit>((site) => ({kind: 'site', pos: site.pos, site})),
    ...replacements.map<Edit>((rep) => ({
      kind: 'replace',
      start: rep.start,
      end: rep.end,
      text: rep.text,
    })),
  ];
  edits.sort((a, b) => {
    const ax = a.kind === 'site' ? a.pos : a.start;
    const bx = b.kind === 'site' ? b.pos : b.start;
    return bx - ax;
  });

  let buf = Buffer.from(code, 'utf8');
  for (const edit of edits) {
    if (edit.kind === 'site') {
      const insertion = Buffer.from(buildInsertion(edit.site), 'utf8');
      buf = Buffer.concat([buf.subarray(0, edit.pos), insertion, buf.subarray(edit.pos)]);
    } else {
      const replacement = Buffer.from(edit.text, 'utf8');
      buf = Buffer.concat([buf.subarray(0, edit.start), replacement, buf.subarray(edit.end)]);
    }
  }

  // The import block lands at offset 0 AFTER every offset-anchored edit has
  // been applied, so it never shifts them. Imports hoist in ESM, so leading
  // directives/comments staying below the block is harmless.
  const importBlock = buildImportBlock(sites, replacements);
  if (importBlock !== '') {
    buf = Buffer.concat([Buffer.from(importBlock, 'utf8'), buf]);
  }
  return {code: buf.toString('utf8'), sites, replacements};
}

// siteBasename derives the entry-module basename a site imports: the
// `<fnHash>_<typeId>` cache key for createX sites (InjectTypeFnArgs), the
// bare typeId for reflection sites (InjectRunTypeId). Both are short
// alphanumeric hashes, so the basename doubles as an identifier-safe
// binding suffix.
function siteBasename(site: Site): string {
  return site.fnId ? `${site.fnId}_${site.id}` : site.id;
}

// siteBinding is the renamed-import identifier a site's insertion references.
function siteBinding(site: Site): string {
  return ENTRY_BINDING_PREFIX + siteBasename(site);
}

// buildImportBlock collects every entry-module import the rewritten file
// needs — one per distinct site basename plus one per replacement carrying
// an importFrom specifier — and renders the deduped import statements.
// Deterministic order (sorted by specifier) keeps rewrites byte-stable.
function buildImportBlock(sites: Site[], replacements: Replacement[]): string {
  const bySpecifier = new Map<string, string>();
  for (const site of sites) {
    if (!site.id) continue;
    const specifier = VIRTUAL_MODULE_PREFIX + siteBasename(site) + ENTRY_MODULE_SUFFIX;
    bySpecifier.set(specifier, siteBinding(site));
  }
  for (const replacement of replacements) {
    if (replacement.importFrom) bySpecifier.set(replacement.importFrom, replacement.text);
  }
  if (bySpecifier.size === 0) return '';
  const specifiers = [...bySpecifier.keys()].sort();
  let block = '';
  for (const specifier of specifiers) {
    block += `import {${ENTRY_EXPORT_NAME} as ${bySpecifier.get(specifier)}} from '${specifier}';\n`;
  }
  return block;
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
