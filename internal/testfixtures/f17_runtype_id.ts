/// <reference path="./runtypes.d.ts" />
import {getRuntypeId, type InjectRuntypeId} from '@mionjs/ts-go-run-types';

export {};

// 17a — static call with explicit type argument.
const a = getRuntypeId<{id: number; name: string}>();

// 17b — static call with a primitive type argument.
const b = getRuntypeId<string>();

// 17c — user-defined wrapper. The trailing `id?: InjectRuntypeId<T>` opts the
// function into transformer injection at every call site, just like
// getRuntypeId itself.
function isType<T>(_v: unknown, id?: InjectRuntypeId<T>): InjectRuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = isType<{flag: boolean}>(true);

// 17d — wrapper used with T inferred from an argument.
function nameOf<T>(_val: T, id?: InjectRuntypeId<T>): InjectRuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const d = nameOf({kind: 'node', value: 42});

// 17e — call inside a generic body. `T` is the *outer* free type parameter,
// so this must be SKIPPED by the scanner — there's nothing to inject yet.
function inner<T>(_val: T): InjectRuntypeId<T> {
  return getRuntypeId<T>();
}

// 17f — collision: a user-defined type also named `InjectRuntypeId`, declared
// outside the marker module. The scanner must ignore this — only the
// `@mionjs/ts-go-run-types` one counts.
type RuntypeId_Local<T> = {readonly localBrand?: T};
function maskedWrapper<T>(_v: T, _id?: RuntypeId_Local<T>): void {}
maskedWrapper('noop');
