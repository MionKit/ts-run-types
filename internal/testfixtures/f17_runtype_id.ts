/// <reference path="./runtypes.d.ts" />
import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';

export {};

// 17a — direct call, T inferred from val.
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = getRuntypeId(u);

// 17b — explicit type argument.
const b = getRuntypeId<string>();

// 17c — user-defined wrapper. The trailing `id?: RuntypeId<T>` opts the
// function into transformer injection at every call site, just like
// getRuntypeId itself.
function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = isType<{flag: boolean}>(true);

// 17d — wrapper used with T inferred from an argument.
function nameOf<T>(_val: T, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const d = nameOf({kind: 'node', value: 42});

// 17e — call inside a generic body. `T` is the *outer* free type parameter,
// so this must be SKIPPED by the scanner — there's nothing to inject yet.
function inner<T>(val: T): RuntypeId<T> {
  return getRuntypeId<T>(val);
}

// 17f — collision: a user-defined type also named `RuntypeId`, declared
// outside the marker module. The scanner must ignore this — only the
// `@mionjs/ts-go-run-types` one counts.
type RuntypeId_Local<T> = {readonly localBrand?: T};
function maskedWrapper<T>(_v: T, _id?: RuntypeId_Local<T>): void {}
maskedWrapper('noop');
