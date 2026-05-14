/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
class User {
  id: number = 0;
  greet(): void {}
}
declare const u: User;
getRuntypeId<User>(u);
