import {VIRTUAL_RUNTYPES_PREFIX, VIRTUAL_RUNTYPES_EXT} from './runtypes-constants.generated.ts';
import type {SiteScanner} from './scan-batcher.ts';
import type {Replacement, Site} from './protocol.ts';

// Rewritten carries the patched source + the sites and replacements
// the Go binary returned. `sites[i].pos` is the byte offset of the
// close-paren in the ORIGINAL source; replacements are also against
// the original source. Consumers using these positions after applying
// `code` must account for the offset shift introduced by the rewrites.
export interface Rewritten {
  code: string;
  sites: Site[];
  replacements: Replacement[];
}

// rewrite asks the resolver to scan the given file and apply three kinds
// of edits returned from the Go binary:
//
//   1. Site insertions: the resolved injection payload is slipped in just
//      before each call's closing `)`. Shape per site (module mode adds
//      the imported entry bindings of the site's deps closure):
//        createX site            [id, fnId]  /  [id, fnId, [rt1, rt2]]
//        graph-demand site       "id"        /  [id, [rt1, rt2]]
//        bare reflection site    "id"
//   2. Replacements: byte-range substitutions (e.g. the pure-fn
//      extractor nulls out the factory argument of every
//      `registerPureFnFactory(ns, fn, factory)` call so the factory
//      body lives only in the emitted pureFns cache module).
//   3. Module-mode import hoisting: one `import {entry as rtN} from
//      'virtual:runtypes/<key>.js'` per distinct dep key, APPENDED at
//      EOF — import declarations hoist in ESM, so the position is
//      irrelevant to semantics, and appending keeps every byte offset
//      in (1) and (2) valid against the original source.
//
// Insertion/replacement edits are sorted right-to-left by start position
// and applied in one pass — earlier offsets remain valid as we edit.
// Positions from the resolver are UTF-8 BYTE offsets (because tsgo
// internally indexes its source files by byte), so we operate on a
// Buffer rather than a JS string — UTF-16 code-unit math would skew on
// any multibyte char like an em-dash in a comment.
export async function rewrite(file: string, code: string, resolver: SiteScanner): Promise<Rewritten> {
  const result = await resolver.scanFiles([file]);
  const sites = result.sites;
  const replacements = result.replacements ?? [];
  if (sites.length === 0 && replacements.length === 0) {
    return {code, sites, replacements};
  }

  const depNames = allocateDepNames(code, sites);

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
      const insertion = Buffer.from(buildInsertion(edit.site, depNames), 'utf8');
      buf = Buffer.concat([buf.subarray(0, edit.pos), insertion, buf.subarray(edit.pos)]);
    } else {
      const replacement = Buffer.from(edit.text, 'utf8');
      buf = Buffer.concat([buf.subarray(0, edit.start), replacement, buf.subarray(edit.end)]);
    }
  }
  if (depNames.size > 0) {
    const importLines = [...depNames]
      .map(([key, name]) => `import {entry as ${name}} from '${VIRTUAL_RUNTYPES_PREFIX}${key}${VIRTUAL_RUNTYPES_EXT}';`)
      .join('\n');
    buf = Buffer.concat([buf, Buffer.from('\n' + importLines + '\n', 'utf8')]);
  }
  return {code: buf.toString('utf8'), sites, replacements};
}

// allocateDepNames assigns one short file-local binding name per distinct dep
// key across every site, in first-use order (rt1, rt2, …). When the ORIGINAL
// source already uses an `rt<N>` identifier the whole file falls back to a
// prefixed scheme (_rt1, __rt1, …) — checked against the source text, not the
// rewritten output, since every name we mint appears in both.
function allocateDepNames(code: string, sites: Site[]): Map<string, string> {
  const names = new Map<string, string>();
  let prefix = 'rt';
  while (new RegExp(`\\b${prefix}\\d+\\b`).test(code)) prefix = '_' + prefix;
  for (const site of sites) {
    for (const key of site.deps ?? []) {
      if (!names.has(key)) names.set(key, `${prefix}${names.size + 1}`);
    }
  }
  return names;
}

// buildInsertion produces the text to splice in just before the call's
// closing `)`. The result accounts for two variables:
//   - existing argument count (do we need a leading comma?)
//   - whether earlier optional slots need `undefined` placeholders so the
//     injected value lands at the right paramIndex.
function buildInsertion(s: Site, depNames: Map<string, string>): string {
  const argsCount = s.argsCount ?? 0;
  const paramIndex = s.paramIndex ?? argsCount;
  const padding = Math.max(0, paramIndex - argsCount);
  const parts: string[] = [];
  for (let i = 0; i < padding; i++) parts.push('undefined');
  const depsExpr = s.deps?.length ? `[${s.deps.map((key) => depNames.get(key)).join(', ')}]` : undefined;
  // createX sites (InjectTypeFnArgs marker) carry an fnId — inject a
  // `[id, fnId]` tuple (module mode: `[id, fnId, [deps]]`) so the runtime
  // resolves the precise function family without recomputing a cache key.
  // Graph-demand sites (InjectRunTypeData) inject `[id, [deps]]`; bare
  // reflection sites (InjectRunTypeId) inject the id string.
  if (s.fnId) {
    parts.push(
      depsExpr
        ? `[${JSON.stringify(s.id)}, ${JSON.stringify(s.fnId)}, ${depsExpr}]`
        : `[${JSON.stringify(s.id)}, ${JSON.stringify(s.fnId)}]`
    );
  } else {
    parts.push(depsExpr ? `[${JSON.stringify(s.id)}, ${depsExpr}]` : JSON.stringify(s.id));
  }
  const body = parts.join(', ');
  return argsCount > 0 ? `, ${body}` : body;
}
