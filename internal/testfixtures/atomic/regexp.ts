/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
const v: RegExp = /abc/i;
getRuntypeId<RegExp>(v);
