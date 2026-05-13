/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
function wrap<T>(x: T): T {
  return x;
}
const info = getRuntypeId(wrap({a: 1, b: 'x'}));
