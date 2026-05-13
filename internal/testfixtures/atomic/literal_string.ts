/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
const v: 'hello' = 'hello';
getRuntypeId<'hello'>(v);
