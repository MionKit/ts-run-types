// @ts-nocheck
//
// ⚠️  SYNC BOUNDARY — NOT AUTO-GENERATED, MUST STAY ALIGNED WITH THE GO EMITTER
// See the banner at the top of `isTypeCache.ts` for the full contract.
//
// Runtypes cache module skeleton. The Go binary splices generated factory
// calls + ref assignments into the marker line below.
//
// - `rt(id, …)` adds one entry to the run-type registry with every ref slot
//   pre-set to `undefined`.
// - `c(id)` aliases `rtUtils.useRunType` — footer assignments patch ref slots
//   via `c('id').child = c('id2')`. `useRunType` throws on missing ids, so
//   emitter bugs surface immediately.
//
// `addRunType` overwrites by id, so HMR re-eval picks up new entries without
// a full reload.

'use strict';

/** @typedef {import('../runtypes/types.ts').RunType} RunType */

/** @param {import('../runtypes/rtUtils.ts').RTUtils} rtUtils */
export function initCache(rtUtils) {
  /** Short alias for `rtUtils.useRunType` used by footer ref assignments. */
  function c(id) {
    return rtUtils.useRunType(id);
  }
  // 19-arg positional shape — id + identification fields. Ref slots start
  // as `undefined` and are patched by footer assignments.
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
    /** @type {RunType} */
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
    rtUtils.addRunType(id, entry);
  }
  // Reference the helpers so an empty body (no generated calls) doesn't trip
  // `noUnusedLocals`.
  void rt;
  void c;

  // #### REPLACE HERE ####
}
