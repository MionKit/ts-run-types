/// <reference path="./runtypes.d.ts" />
export {};
const makeUser = (id: number, name: string) => ({ id, name });
const u = makeUser(1, "m");
const info = getTypeInfo(u);
