import type { ResolverClient } from "./resolver-client.js";

// Markers the rewriter recognises. `kind` dictates which resolver op is used:
//   - "argInferred": resolve the inferred type of the first argument (router, getTypeInfo)
//   - "typeArg":     resolve the first type argument (isType<T>)
export interface Marker {
  name: string;
  kind: "argInferred" | "typeArg";
}

export const DEFAULT_MARKERS: readonly Marker[] = [
  { name: "getTypeInfo", kind: "argInferred" },
  { name: "isType", kind: "typeArg" },
  { name: "router", kind: "argInferred" },
];

export interface Rewritten {
  code: string;
  // type ids resolved in this file — consumer uses these to populate the cache
  sites: Array<{ pos: number; id: string; marker: string }>;
}

// findMarkerCalls locates call-site positions of the given markers by regex.
// Good enough for the POC; a production plugin would use a proper parser
// (esprima / es-module-lexer / ts.createSourceFile) to avoid false positives
// inside strings and comments.
export function findMarkerCalls(
  code: string,
  markers: readonly Marker[],
): Array<{ pos: number; marker: Marker }> {
  const out: Array<{ pos: number; marker: Marker }> = [];
  for (const m of markers) {
    const re = new RegExp(`\\b${m.name}\\s*[<(]`, "g");
    let match: RegExpExecArray | null;
    while ((match = re.exec(code)) !== null) {
      out.push({ pos: match.index, marker: m });
    }
  }
  out.sort((a, b) => a.pos - b.pos);
  return out;
}

// Rewrite asks the resolver for the type at each marker call site and
// injects the resulting id as an extra argument. The transform is textual and
// non-destructive: the original call is preserved, we just append ", \"<id>\"".
export async function rewrite(
  file: string,
  code: string,
  markers: readonly Marker[],
  resolver: ResolverClient,
): Promise<Rewritten> {
  const calls = findMarkerCalls(code, markers);
  const sites: Rewritten["sites"] = [];

  // Walk from right to left so earlier offsets stay valid after rewriting.
  const patches: Array<{ start: number; end: number; text: string }> = [];

  for (const c of calls) {
    const resp =
      c.marker.kind === "typeArg"
        ? await resolver.request({
            op: "resolveTypeArgument",
            file,
            callPos: c.pos,
            index: 0,
          })
        : await resolver.request({
            op: "resolveArgumentInferred",
            file,
            callPos: c.pos,
            index: 0,
          });

    if (resp.error || !resp.id) continue; // skip unresolvable sites

    sites.push({ pos: c.pos, id: resp.id, marker: c.marker.name });

    // Find the matching ')' for this call so we can insert just before it.
    const close = findCallClose(code, c.pos);
    if (close < 0) continue;
    const before = code[close - 1];
    const insert = before === "(" ? `"${resp.id}"` : `, "${resp.id}"`;
    patches.push({ start: close, end: close, text: insert });
  }

  patches.sort((a, b) => b.start - a.start);
  let out = code;
  for (const p of patches) {
    out = out.slice(0, p.start) + p.text + out.slice(p.end);
  }
  return { code: out, sites };
}

// findCallClose scans forward from the start of a marker call and returns the
// index of the matching ')'. Handles nested parens, brackets, template
// literals, and string literals in a best-effort way.
function findCallClose(code: string, callStart: number): number {
  // Skip past the identifier to its first '('.
  let i = callStart;
  while (i < code.length && code[i] !== "(" && code[i] !== "<") i++;
  if (code[i] === "<") {
    // Skip type-argument list.
    let depth = 1;
    i++;
    while (i < code.length && depth > 0) {
      if (code[i] === "<") depth++;
      else if (code[i] === ">") depth--;
      i++;
    }
    while (i < code.length && code[i] !== "(") i++;
  }
  if (code[i] !== "(") return -1;
  let depth = 1;
  let j = i + 1;
  while (j < code.length && depth > 0) {
    const ch = code[j];
    if (ch === "(" || ch === "[" || ch === "{") depth++;
    else if (ch === ")" || ch === "]" || ch === "}") depth--;
    else if (ch === '"' || ch === "'") {
      j = skipString(code, j, ch);
      continue;
    } else if (ch === "`") {
      j = skipTemplate(code, j);
      continue;
    } else if (ch === "/" && code[j + 1] === "/") {
      j = code.indexOf("\n", j);
      if (j < 0) return -1;
    } else if (ch === "/" && code[j + 1] === "*") {
      j = code.indexOf("*/", j) + 2;
      if (j < 2) return -1;
    }
    j++;
  }
  return depth === 0 ? j - 1 : -1;
}

function skipString(code: string, start: number, quote: string): number {
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === "\\") {
      i += 2;
      continue;
    }
    if (code[i] === quote) return i + 1;
    i++;
  }
  return code.length;
}

function skipTemplate(code: string, start: number): number {
  let i = start + 1;
  while (i < code.length) {
    if (code[i] === "\\") {
      i += 2;
      continue;
    }
    if (code[i] === "`") return i + 1;
    if (code[i] === "$" && code[i + 1] === "{") {
      let depth = 1;
      i += 2;
      while (i < code.length && depth > 0) {
        if (code[i] === "{") depth++;
        else if (code[i] === "}") depth--;
        i++;
      }
      continue;
    }
    i++;
  }
  return code.length;
}
