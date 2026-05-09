/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: bigint = 1n;
getRuntypeId<bigint>(v);
