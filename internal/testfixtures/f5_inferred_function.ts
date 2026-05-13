/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
const add = (a: number, b: number) => a + b;
const info = getRuntypeId(add);
