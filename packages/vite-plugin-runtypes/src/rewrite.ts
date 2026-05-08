import type { ResolverClient } from "./resolver-client.js";
import type { Site } from "./protocol.js";

// Rewritten carries the patched source + the sites the Go binary returned.
// `sites[i].pos` is the byte offset of the close-paren in the ORIGINAL
// source; consumers using these positions after applying `code` must
// account for the offset shift introduced by the inserted ids.
export interface Rewritten {
  code: string;
  sites: Site[];
}

// rewrite asks the resolver to scan the given file and inject the resolved
// id at each detected call site. The injection is purely textual: the id is
// stringified and slipped in just before the call's closing `)`. The
// transformer doesn't reparse the file — the Go binary already has the AST.
//
// Sites are applied right-to-left so earlier offsets remain valid as we
// edit. Positions from the resolver are UTF-8 BYTE offsets (because tsgo
// internally indexes its source files by byte), so we operate on a Buffer
// rather than a JS string — UTF-16 code-unit math would skew on any
// multibyte char like an em-dash in a comment.
export async function rewrite(
  file: string,
  code: string,
  resolver: ResolverClient,
): Promise<Rewritten> {
  const sites = await resolver.scanFile(file);
  if (sites.length === 0) return { code, sites: [] };

  let buf = Buffer.from(code, "utf8");
  const sorted = [...sites].sort((a, b) => b.pos - a.pos);
  for (const s of sorted) {
    const insertion = Buffer.from(buildInsertion(s), "utf8");
    buf = Buffer.concat([buf.subarray(0, s.pos), insertion, buf.subarray(s.pos)]);
  }
  return { code: buf.toString("utf8"), sites };
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
  for (let i = 0; i < padding; i++) parts.push("undefined");
  parts.push(JSON.stringify(s.id));
  const body = parts.join(", ");
  return argsCount > 0 ? `, ${body}` : body;
}
