/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
const sym: unique symbol = Symbol('hello');
getRuntypeId<typeof sym>(sym);
