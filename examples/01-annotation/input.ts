/// <reference path="../../internal/testfixtures/runtypes.d.ts" />
export {};
type User = { id: number; name: string };
const u: User = { id: 1, name: "mario" };
isType<User>(u);
const info = getTypeInfo(u);
