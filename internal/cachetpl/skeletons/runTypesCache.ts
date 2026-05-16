// @ts-nocheck
// Hand-authored skeleton for the runtypes cache module. The Go binary
// reads this file (via the internal/cachetpl embedded copy) and replaces
// the marker line below with generated factory calls + ref assignments
// before serving the result as `virtual:runtypes-cache`.
//
// Authored as plain JS in a .ts file so:
//   - devs see the cache shape alongside the rest of the package source;
//   - the served body parses identically through Vite (ts pipeline) and
//     through `new Function` (used by the Vite plugin tests).
//
// `cache` is a flat `{[id]: RunType}` table. `rt(id, …)` materialises one
// entry with every ref slot pre-set to `undefined`; the generated region
// then patches ref slots directly via `cache['id'].child = cache['id2'];`
// — same shape as today's emitted footer, only the accessor changed.

const cache = {};
let isInitialised = false;

function rt(
  id,
  kind,
  subKind,
  typeName,
  name,
  literal,
  optional,
  readonly,
  isAbstract,
  isStatic,
  visibility,
  isSafeName,
  position,
  inlined,
  flags,
  description,
  defaultVal,
  enumVal,
  values
) {
  cache[id] = {
    id,
    kind,
    subKind,
    typeName,
    name,
    literal,
    optional,
    readonly,
    isAbstract,
    isStatic,
    visibility,
    isSafeName,
    position,
    inlined,
    flags,
    description,
    defaultVal,
    enumVal,
    values,
    child: undefined,
    index: undefined,
    return: undefined,
    indexType: undefined,
    parameters: undefined,
    children: undefined,
    safeUnionChildren: undefined,
    unionDiscriminators: undefined,
    decorators: undefined,
    typeArguments: undefined,
    arguments: undefined,
    extendsArguments: undefined,
    implements: undefined,
    extends: undefined,
    classType: undefined,
  };
}

export function initCache(/* jitUtils */) {
  if (isInitialised) return cache;
  isInitialised = true;

  // #### REPLACE HERE ####

  return cache;
}
