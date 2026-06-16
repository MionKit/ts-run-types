// Reflection-node accessor — the value-bearing companion to `getRunTypeId`.
// Where `getRunTypeId<T>()` returns the opaque id string, `getRunType<T>()`
// returns the traversable `RunType<T>` node the build registered for `T`, i.e.
// `getRTUtils().getRunType(getRunTypeId<T>())` collapsed into one call. Kept in
// its own file (like `createMockType`) so markers.ts stays registry-free.

import {getRTUtils} from './runtypes/rtUtils.ts';
import {entryTupleKey, initFromTuple, isEntryTuple} from './runtypes/entryTuple.ts';
import type {InjectRunTypeId} from './markers.ts';
import type {RunType} from './runtypes/types.ts';

/**
 * Returns the reflected `RunType<T>` node — the parsed, traversable type graph
 * (`kind`, `children`, `parameters`, `child`, `return`, format annotations, …).
 * One function, two call shapes, mirroring `getRunTypeId`:
 *
 *   - STATIC — bring the type, no value: `getRunType<User>()`.
 *   - REFLECTION — let `T` be inferred from a runtime value: `getRunType(user)`.
 *     The value is read only for its type; at runtime it is ignored.
 *
 * A trailing `InjectRunTypeId<T>` parameter the build fills at the call site, so
 * `getRunType` is itself a `getRunTypeId` wrapper — the transformer injects the
 * entry tuple, the call registers the type graph, and the node is returned.
 * Throws if the transformer isn't active (no id injected) or the build emitted
 * no entry for the resolved id.
 */
export function getRunType<T>(_value?: T, id?: InjectRunTypeId<T>): RunType<T> {
  let injectedId: string | undefined = id;
  if (isEntryTuple(id)) {
    // The plugin injects the runtype's entry-module tuple — register the type
    // graph and recover the id string, exactly as createMockType does.
    initFromTuple(id);
    injectedId = entryTupleKey(id);
  }
  if (injectedId === undefined) {
    throw new Error('getRunType(): no id injected. vite-plugin-runtypes must be active.');
  }
  const runType = getRTUtils().getRunType(injectedId);
  if (!runType) {
    throw new Error(
      `getRunType(): no RunType entry for "${injectedId}" in rtUtils. The build pipeline didn't emit a cache entry for that runtype.`
    );
  }
  return runType as RunType<T>;
}
