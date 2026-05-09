/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: symbol = Symbol('x');
getRuntypeId<symbol>(v);
