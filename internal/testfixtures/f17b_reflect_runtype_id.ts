/// <reference path="./runtypes.d.ts" />
import {reflectRuntypeId, type InjectRuntypeId} from '@mionjs/ts-go-run-types';

export {};

// 17ba — direct reflect call, T inferred from val.
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = reflectRuntypeId(u);

// 17bb — reflect on a primitive.
const s: string = 'hello';
const b = reflectRuntypeId(s);

// 17bc — user-defined wrapper. Same opt-in rule as f17 — the trailing
// `id?: InjectRuntypeId<T>` is what the scanner looks at; the callee identity
// is irrelevant.
function isType<T>(_v: unknown, id?: InjectRuntypeId<T>): InjectRuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = isType<{flag: boolean}>(true);

// 17bd — wrapper with T inferred from a value argument.
function nameOf<T>(_val: T, id?: InjectRuntypeId<T>): InjectRuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const d = nameOf({kind: 'node', value: 42});

// 17be — reflect inside a generic body. `T` is a free outer type parameter,
// so this must be SKIPPED.
function inner<T>(val: T): InjectRuntypeId<T> {
  return reflectRuntypeId<T>(val);
}

// 17bf — foreign `InjectRuntypeId` lookalike — declared outside the marker module.
// The scanner must ignore this even with a value passed.
type RuntypeId_Local<T> = {readonly localBrand?: T};
function maskedWrapper<T>(_v: T, _id?: RuntypeId_Local<T>): void {}
maskedWrapper('noop');
