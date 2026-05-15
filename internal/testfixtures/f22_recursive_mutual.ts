/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
interface A {
  b: B;
}
interface B {
  a: A;
}
declare const a: A;
getRuntypeId<A>(a);
