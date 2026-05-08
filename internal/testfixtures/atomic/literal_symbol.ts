/// <reference path="./runtypes.d.ts" />
export {};
const sym: unique symbol = Symbol("hello");
isType<typeof sym>(sym);
