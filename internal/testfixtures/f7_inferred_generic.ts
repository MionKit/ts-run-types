/// <reference path="./runtypes.d.ts" />
export {};
function wrap<T>(x: T): T { return x; }
const info = getTypeInfo(wrap({ a: 1, b: "x" }));
