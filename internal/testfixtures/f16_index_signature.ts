/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
interface M {
  [k: string]: number;
}
declare const m: M;
getRuntypeId<M>(m);
