/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
type Result = {ok: true; value: number} | {ok: false; error: string};
declare const x: unknown;
getRuntypeId<Result>(x);
