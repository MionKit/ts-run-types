/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
declare const p: Promise<number>;
const info = getRuntypeId(p);
