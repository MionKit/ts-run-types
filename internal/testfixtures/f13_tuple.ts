/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
const tup: [number, string?] = [1];
const info = getRuntypeId(tup);
