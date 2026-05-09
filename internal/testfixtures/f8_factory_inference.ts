/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const makeUser = (id: number, name: string) => ({id, name});
const u = makeUser(1, 'm');
const info = getRuntypeId(u);
