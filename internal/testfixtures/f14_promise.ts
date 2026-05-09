/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
declare const p: Promise<number>;
const info = getRuntypeId(p);
