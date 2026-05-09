/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
const v: 42 = 42;
getRuntypeId<42>(v);
