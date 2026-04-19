/// <reference path="../../internal/testfixtures/runtypes.d.ts" />
export {};
const makeUser = (id: number, name: string) => ({ id, name });
const u = makeUser(1, "mario");
const info = getTypeInfo(u);
