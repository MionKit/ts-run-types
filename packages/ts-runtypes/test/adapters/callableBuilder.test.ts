// Value-first callable-interface builder — `RT.callable(func, object)` mixes a
// call-signature schema with an interface's data properties to author a value
// that is BOTH callable AND carries data props, e.g.
// `{(a: number, b: boolean): string; extra: string}`. The mix is an intersection
// (TS can't express a single object literal with a call signature + mapped props),
// but the Go scanner projects it as an object literal carrying the call signature
// + members, and the structural id embeds the call signature — so it converges
// with the type-first callable interface. See src/schema/compose.ts.
//
// `createValidate` returns the cached factory for a structural id, so `toBe`
// (reference identity) is a same-id (convergence) assertion.

import {describe, expect, it} from 'vitest';
import {createValidate, type Static} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';

type CallableIface = {(a: number, b: boolean): string; extra: string};

describe('value-first callable builder', () => {
  const schema = RT.callable(RT.func([RT.number(), RT.boolean()], RT.string()), RT.object({extra: RT.string()}));

  it('converges with the type-first callable interface', () => {
    expect(createValidate(schema)).toBe(createValidate<CallableIface>());
  });

  it('validates a callable interface (function value PLUS data props)', () => {
    const isCallable = createValidate(schema);
    // The call-signature half is notSupported (functions aren't validated): the
    // emitted validator checks `typeof === 'function'` PLUS the declared props.
    const fnWithExtra = Object.assign((_a: number, _b: boolean) => 'x', {extra: 'x'});
    expect(isCallable(fnWithExtra), 'function carrying extra').toBe(true);
    expect(isCallable({extra: 'x'}), 'plain object is not a function').toBe(false);
    const fnNoExtra = (_a: number, _b: boolean) => 'x';
    expect(isCallable(fnNoExtra), 'function missing the required extra prop').toBe(false);
  });

  it('Static recovers the callable interface (assignment-equivalent)', () => {
    type Recovered = Static<typeof schema>;
    const value: CallableIface = Object.assign((_a: number, _b: boolean) => 'x', {extra: 'x'});
    const fromType: Recovered = value; // type-first value -> recovered type
    const toType: CallableIface = fromType; // recovered type -> type-first
    expect([fromType, toType]).toBeDefined();
  });
});
