// Single runner for the cloneExactShape suite. Cases live in per-area
// fixtures (Atomic.ts, Objects.ts, Containers.ts, Natives.ts, Unions.ts,
// Isolation.ts), mirroring the overrides suite layout: each file exports a
// registrar that declares its it()s, and this runner groups them.
//
// The contract under test — a proper deep clone of the DECLARED shape:
// undeclared keys dropped by construction, the input never mutated, and
// `clone(x) !== x` for every object-typed position. Only primitives (compare
// by value; freshness is meaningless) and opaque unshaped values (functions,
// resource handles, any/unknown) pass through.

import {describe} from 'vitest';
import {registerAtomicCloneCases} from './Atomic.ts';
import {registerObjectCloneCases} from './Objects.ts';
import {registerContainerCloneCases} from './Containers.ts';
import {registerNativeCloneCases} from './Natives.ts';
import {registerUnionCloneCases} from './Unions.ts';
import {registerIsolationCloneCases} from './Isolation.ts';

describe('cloning', () => {
  describe('atomic + opaque pass-through', registerAtomicCloneCases);
  describe('objects & classes', registerObjectCloneCases);
  describe('containers', registerContainerCloneCases);
  describe('natives', registerNativeCloneCases);
  describe('unions', registerUnionCloneCases);
  describe('isolation & flows', registerIsolationCloneCases);
});
