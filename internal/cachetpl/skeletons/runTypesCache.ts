// @ts-nocheck
// Hand-authored skeleton for the runtypes cache module. The Go binary
// reads this file (via the internal/cachetpl embedded copy) and replaces
// the marker line below with generated factory calls + ref assignments
// before serving the result via the Vite plugin's `transform()` hook
// (or, in source mode under vitest, this file itself acts as the
// empty-state fallback module).
//
// Authored as plain JS in a .ts file so:
//   - devs see the cache shape alongside the rest of the package source;
//   - the served body parses identically through Vite (ts pipeline) and
//     through `new Function` (used by the Vite plugin tests).
//
// Both `rt(…)` and `c(…)` close over `jitUtils`:
//   - `rt(id, …)` adds one entry to the shared jitUtils run-type registry
//     with every ref slot pre-set to `undefined`;
//   - `c(id)` is a short alias for `jitUtils.useRunType` — the footer
//     ref-assignment lines do `c('id').child = c('id2');` to patch slots
//     after every entry exists. `useRunType` throws on a missing id, so
//     emitter bugs surface immediately instead of producing a chain of
//     undefined references.
//
// initCache is intentionally idempotent: `addRunType` overwrites by id,
// which is what HMR needs — a stale page calling initCache against a
// fresh jitUtils picks up the new entries by key without a full reload.

'use strict';

export function initCache(jitUtils) {
  function c(id) {
    return jitUtils.useRunType(id);
  }
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
    jitUtils.addRunType(id, {
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
    });
  }
  // Reference the helpers so a freshly-served empty body (no generated
  // calls yet) doesn't trip `noUnusedLocals` on the consumer side.
  void rt;
  void c;

  // #### REPLACE HERE ####
}
