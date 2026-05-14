/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
type User = {id: number; name: string};
const u = {id: 1, name: 'm'} as User;
getRuntypeId<User>(u);
