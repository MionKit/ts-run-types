/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
const v: 'hello' = 'hello';
getRuntypeId<'hello'>(v);
