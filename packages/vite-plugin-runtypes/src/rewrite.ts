import type {ResolverClient} from './resolver-client.ts';
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

// rewrite asks the resolver to scan the given file and apply two kinds
// of byte-offset edits returned from the Go binary:
//
//   1. Site insertions: the resolved runtypes id is slipped in just
//      before each call's closing `)`.
//   2. Replacements: byte-range substitutions (e.g. the pure-fn
//      extractor nulls out the factory argument of every
//      `registerPureFnFactory(ns, fn, factory)` call so the factory
//      body lives only in the emitted pureFns cache module).
//
// Both edit kinds are sorted right-to-left by start position and
// applied in one pass — earlier offsets remain valid as we edit.
// Positions from the resolver are UTF-8 BYTE offsets (because tsgo
// internally indexes its source files by byte), so we operate on a
// Buffer rather than a JS string — UTF-16 code-unit math would skew on
// any multibyte char like an em-dash in a comment.
export async function rewrite(file: string, code: string, resolver: ResolverClient): Promise<Rewritten> {
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
    // EmitOnly sites carry a (typeid, options) pair the Go emitter uses
    // to materialise a variant factory; they do NOT correspond to a
    // call-site rewrite, so skip them from the patcher's edit list.
    ...sites.filter((site) => !site.emitOnly).map<Edit>((site) => ({kind: 'site', pos: site.pos, site})),
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
  return {code: buf.toString('utf8'), sites, replacements};
}

// buildInsertion produces the text to splice in just before the call's
// closing `)`. The result accounts for two variables:
//   - existing argument count (do we need a leading comma?)
//   - whether earlier optional slots need `undefined` placeholders so the
//     id lands at the right paramIndex.
function buildInsertion(s: Site): string {
  const argsCount = s.argsCount ?? 0;
  const paramIndex = s.paramIndex ?? argsCount;
  const padding = Math.max(0, paramIndex - argsCount);
  const parts: string[] = [];
  for (let i = 0; i < padding; i++) parts.push('undefined');
  parts.push(JSON.stringify(s.id));
  const body = parts.join(', ');
  return argsCount > 0 ? `, ${body}` : body;
}
