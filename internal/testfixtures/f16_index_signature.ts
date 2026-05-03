/// <reference path="./runtypes.d.ts" />
export {};
interface M { [k: string]: number }
declare const m: M;
isType<M>(m);
