/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const sym: unique symbol = Symbol('hello');
getRuntypeId<typeof sym>(sym);
