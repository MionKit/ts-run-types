// Universal value-first reflection primitives — the foundation the composer and
// leaf builders specialize. Both return the live `RunType<T>` node the Go
// scanner reflects for `T`, via the SAME trailing-`InjectRunTypeId<T>` marker
// every builder uses: the scanner reflects whatever TS resolved `T` to — a
// union, an intersection, a utility type, a template literal, a conditional —
// and the runtime returns that node.
//
//   • `runType<T>()`           — static: caller supplies `T` explicitly.
//   • `reflectRunType(value)`  — reflection: `T` inferred from a runtime value.
//
// They mirror `getRunTypeId<T>()` / `reflectRunTypeId(value)` (markers.ts) but
// return the RunType node instead of the bare id string, so the result drops
// straight into `createIsTypeFor(...)` or nests inside `object`/`array`/….

import {builderResult} from './define.ts';
import type {RunType} from '../runtypes/types.ts';
import type {InjectRunTypeId, RejectAny} from '../markers.ts';

/** Static universal reflector: `runType<Partial<User>>()`,
 *  `` runType<`a-${number}`>() ``, `runType<Map<string, number>>()`. Returns the
 *  live `RunType<T>` node for `T` (anything TS can resolve). The trailing
 *  `id?: InjectRunTypeId<T>` is injected by vite-plugin-runtypes; a nested call
 *  is skipped by the scanner (the enclosing marker reflects the whole shape). **/
export function runType<T>(id?: InjectRunTypeId<T>): RunType<T> {
  return builderResult(id, {type: 'reflected'});
}

/** Reflection universal reflector: `reflectRunType(value)` infers `T` from a
 *  runtime value (only its static type matters; the value is ignored at
 *  runtime). Rejects inferred-`any` at the type level, mirroring
 *  `reflectRunTypeId`. **/
export function reflectRunType<T>(_value: RejectAny<T>, id?: InjectRunTypeId<T>): RunType<T> {
  return builderResult(id, {type: 'reflected'});
}
