// Public surface for the mock-value generator — separated from
// `createJitFunctions.ts` so bundlers can leave the entire mock
// subtree (the walker, atomic generators, constant pools, options
// types) out of consumer bundles that never touch `createMockType`.
// Mock is a development / test feature; production callers shouldn't
// pay for it. Mirrors the tree-shaking rationale at the top of
// `createBinary.ts`.
//
// Unlike every other `createXxx` factory in this package, mock does
// NOT use a per-type JIT cache. The walker reads the existing
// `runTypesCache` (populated at module load time by `index.ts`) and
// generates values at runtime — see `./mockType.ts` for the per-kind
// dispatch and `./mockTypes.ts` for the option surface.

import {getJitUtils} from '../jit/jitUtils.ts';
import type {InjectRuntypeId} from '../index.ts';
import {mockRunType} from './mockType.ts';
import {defaultMockOptions} from './constants.mock.ts';
import type {MockOptions, MockTypeFn, RunTypeMockOptions, DeepPartial} from './mockTypes.ts';

/** Returns a mock-value generator for `T`. Each invocation of the
 *  returned function produces a fresh value that — for non-throwing
 *  kinds — passes `isType<T>`. Per-call options merge over the
 *  factory-level defaults; both merge over `defaultMockOptions`.
 *
 *  The `id` parameter is injected by `vite-plugin-runtypes` at build
 *  time (same marker convention as `createIsType` and friends). Calls
 *  outside the plugin's pipeline throw immediately. **/
export function createMockType<T>(
  val?: T,
  options?: RunTypeMockOptions,
  id?: InjectRuntypeId<T>
): MockTypeFn<T> {
  void val;
  if (id === undefined) {
    throw new Error(
      'createMockType(): no id injected. vite-plugin-runtypes must be active for createMockType to resolve the runtype graph.'
    );
  }
  const utils = getJitUtils();
  const runType = utils.getRunType(id);
  if (!runType) {
    throw new Error(
      `createMockType(): no RunType entry for "${id}" in jitUtils. The build pipeline didn't emit a cache entry for that runtype.`
    );
  }
  const factoryOpts = mergeMockOptions(undefined, options);
  return ((callOpts) => {
    const merged = mergeMockOptions(factoryOpts, callOpts);
    return mockRunType(runType, merged, []) as T;
  }) as MockTypeFn<T>;
}

/** Three-way merge: `defaultMockOptions` ← factory opts ← call opts.
 *  Plain shallow merge of the `mock` slot; nested pool arrays are
 *  replaced (not merged) when a caller supplies a new one. Mirrors
 *  mion's `{...defaultMockOptions, ...(opts.mock || {})}` shape. **/
function mergeMockOptions(
  factoryOpts: RunTypeMockOptions | undefined,
  callOpts: DeepPartial<RunTypeMockOptions> | undefined
): RunTypeMockOptions {
  const factoryMock = factoryOpts?.mock as Partial<MockOptions> | undefined;
  const callMock = callOpts?.mock as Partial<MockOptions> | undefined;
  const merged: MockOptions = {
    ...defaultMockOptions,
    ...(factoryMock ?? {}),
    ...(callMock ?? {}),
  };
  return {mock: merged};
}
