/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
class User {
  id: number = 0;
  greet(): void {}
}
declare const u: User;
getRuntypeId<User>(u);
