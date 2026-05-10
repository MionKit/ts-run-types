/// <reference path="./runtypes.d.ts" />
export {};
class User {
  id: number = 0;
  greet(): void {}
}
declare const u: User;
isType<User>(u);
