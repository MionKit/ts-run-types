/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
const v: Date = new Date();
getRuntypeId<Date>(v);
