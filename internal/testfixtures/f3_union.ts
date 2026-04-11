/// <reference path="./runtypes.d.ts" />
export {};
type Result = { ok: true; value: number } | { ok: false; error: string };
declare const x: unknown;
isType<Result>(x);
