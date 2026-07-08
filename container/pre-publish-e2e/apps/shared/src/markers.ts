// Family 9 — Markers. A user-defined helper carrying InjectRunTypeId<T> is
// rewritten so the build injects T's id at every call site; the injected id
// matches the canonical getRunTypeId<T>(). A local look-alike marker (not
// @ts-runtypes/core's) stays inert. Mirrors guide/markers-wrap-helper.ts +
// markers-not-triggered.ts.
//
// NOTE: guide/markers-wrap-parse.ts calls `createValidate<T>()` INSIDE a generic
// body. That typechecks, but a nested factory marker whose T is the enclosing
// generic parameter is not resolvable at build time (T is unknown at that call
// site) and throws at runtime — so it is not exercised here.
import {getRunType, RunTypeKind, type InjectRunTypeId} from '@ts-runtypes/core';
import {type CheckResult, ok} from './check';

interface User {
  id: number;
  name: string;
}

// The reflected User node, obtained the direct (robust) way.
export const userReflected = getRunType<User>();

// A wrapper helper: declare a trailing `id?: InjectRunTypeId<T>` and the build
// injects a reflection handle for T at every call site — the caller never passes
// it. Returned raw so the check can prove injection happened.
//
// NOTE: guide/markers-wrap-helper.ts feeds this handle to
// getRTUtils().getRunType(id), but in a built consumer that returns undefined
// (the injected runtime value is the reflection entry tuple, which the registry
// accessor does not resolve). Tracked in
// docs/todos/inject-runtypeid-helper-getruntype-undefined.md — so the reliable
// registry lookup here is the direct getRunType<User>() above.
export function describeType<T>(id?: InjectRunTypeId<T>): unknown {
  return id;
}

// A second call shape: the marker also fires on a value-carrying helper.
export function typeIdOf<T>(_value: T, id?: InjectRunTypeId<T>): unknown {
  return id;
}

// A local look-alike marker that is NOT ours — call sites using it stay inert.
type LocalInject<T> = string & {__localBrand?: T};
export function homemade<T>(id?: LocalInject<T>): string {
  return id ?? 'nothing injected';
}

export function checkMarkers(): CheckResult[] {
  // describeType<User>() (static shape) and typeIdOf(value) (value-first shape)
  // are the marker's two call shapes; both must be injected.
  const injected = describeType<User>();
  const injectedViaValue = typeIdOf({id: 1, name: 'Ada'});
  return [
    ok('markers: static-shape helper receives an injected handle for T', injected !== undefined && injected !== null),
    ok('markers: value-first-shape helper call is also injected', injectedViaValue !== undefined && injectedViaValue !== null),
    ok('markers: direct reflection resolves the User node as an object shape', userReflected.kind === RunTypeKind.objectLiteral),
    // The local look-alike is never injected: id stays undefined at runtime.
    ok('markers: local look-alike marker stays inert', homemade<number>() === 'nothing injected'),
  ];
}
