/// <reference path="./runtypes.d.ts" />
export {};
type User = { id: number; name: string };
const u = { id: 1, name: "m" } as User;
isType<User>(u);
