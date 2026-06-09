// Public surface for the mock-value generator — separated from
// `createRTFunctions.ts` so bundlers can drop the whole mock subtree from
// bundles that don't reference `createMockType`. Mock has no per-type RT
// cache; the walker reads `runTypesCache` and generates values at runtime.

import {getRTUtils, isRunTypeSchema} from '../runtypes/rtUtils.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId} from '../index.ts';
import {mockRunType} from './mockType.ts';
import {defaultMockOptions} from './constants.mock.ts';
import type {MockOptions, MockTypeFn, RunTypeMockOptions, DeepPartial} from './mockTypes.ts';

/** Returns a mock-value generator for `T`. Each call produces a fresh value
 *  that passes `validate<T>`. Options merge: call < factory < defaults. Accepts
 *  either a value-first schema (`createMockType(rt)`) or the value/static form.
 *  Throws if the Vite plugin isn't active (no `id` injected). **/
export function createMockType<T>(schema: RunType<T>, options?: RunTypeMockOptions, id?: InjectRunTypeId<T>): MockTypeFn<T>;
export function createMockType<T>(val?: T, options?: RunTypeMockOptions, id?: InjectRunTypeId<T>): MockTypeFn<T>;
export function createMockType<T>(
  valOrSchema?: T | RunType<T>,
  options?: RunTypeMockOptions,
  id?: InjectRunTypeId<T>
): MockTypeFn<T> {
  const effectiveId = isRunTypeSchema(valOrSchema) ? valOrSchema.id : id;
  if (effectiveId === undefined) {
    throw new Error(
      'createMockType(): no id injected. vite-plugin-runtypes must be active for createMockType to resolve the runtype graph.'
    );
  }
  const utils = getRTUtils();
  const runType = utils.getRunType(effectiveId);
  if (!runType) {
    throw new Error(
      `createMockType(): no RunType entry for "${effectiveId}" in rtUtils. The build pipeline didn't emit a cache entry for that runtype.`
    );
  }
  const factoryOpts = mergeMockOptions(undefined, options);
  return ((callOpts) => {
    const merged = mergeMockOptions(factoryOpts, callOpts);
    return mockRunType(runType, merged, []) as T;
  }) as MockTypeFn<T>;
}

/** Three-way merge: defaults ← factory opts ← call opts. Shallow merge of
 *  the `mock` slot; nested pool arrays are replaced when supplied. **/
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
