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

/**
 * Cache entry produced by every `rt(…)` call below.
 *
 * @typedef {import('../jit/types.ts').RunType} RunTypeEntry
 */

/**
 * Positional args the Go renderer passes to `rt(…)`. Slots after `id`
 * are the runtype's identification fields; every ref-shaped slot
 * (`child`, `parameters`, …) starts as `undefined` and is patched
 * post-construction by the emitter's footer assignments via `c(id).<slot>
 * = c(otherId)`.
 *
 * @typedef {object} RunTypeArgs
 * @property {string} id                                 Canonical structural id (hash) keying the cache.
 * @property {unknown} kind                              ReflectionKind constant (see RunTypeKind).
 * @property {unknown} [subKind]                         Sub-classifier (Map / Set / NonSerializable / …).
 * @property {unknown} [typeName]                        TypeScript-source declaration name.
 * @property {unknown} [name]                            Member name when this RT is a Property / Method / TupleMember.
 * @property {unknown} [literal]                         Literal payload (string / number / regexp shape).
 * @property {unknown} [optional]                        Optional-member flag.
 * @property {unknown} [readonly]                        readonly-modifier flag.
 * @property {unknown} [isAbstract]                      Abstract-class flag.
 * @property {unknown} [isStatic]                        Static-member flag.
 * @property {unknown} [visibility]                      public / protected / private.
 * @property {unknown} [isSafeName]                      True when `name` is a valid JS identifier (no bracket access needed).
 * @property {unknown} [position]                        Tuple-member / param positional index.
 * @property {unknown} [inlined]                         Inlined-into-parent marker.
 * @property {unknown} [flags]                           Per-kind freeform flag set.
 * @property {unknown} [description]                     JSDoc / inline doc text.
 * @property {unknown} [defaultVal]                      Default-parameter value.
 * @property {unknown} [enumVal]                         Enum-member value.
 * @property {unknown} [values]                          Enum / template-literal value pool.
 */

export function initCache(jitUtils) {
  /**
   * Short alias for `jitUtils.useRunType` used by the footer ref-
   * assignment lines (`c('id').child = c('id2')`). `useRunType` throws
   * on a missing id, so emitter bugs surface immediately instead of
   * producing a chain of undefined references.
   *
   * @param {string} id
   * @returns {RunTypeEntry}
   */
  function c(id) {
    return jitUtils.useRunType(id);
  }
  /**
   * Adds one RunType entry to the shared jitUtils registry with every
   * ref-shaped slot pre-set to `undefined`. The Go-side renderer emits
   * one `rt(…)` call per cached RunType, then a footer block of `c(id).
   * <slot> = c(otherId)` lines to re-knot the graph after every entry
   * exists.
   *
   * Argument names mirror RunTypeArgs — positional 19-arg signature
   * (see `RunTypeArgs` typedef above for slot semantics).
   */
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
    /** @type {RunTypeEntry} */
    const entry = {
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
    jitUtils.addRunType(id, entry);
  }
  // Reference the helpers so a freshly-served empty body (no generated
  // calls yet) doesn't trip `noUnusedLocals` on the consumer side.
  void rt;
  void c;

  // #### REPLACE HERE ####
}
