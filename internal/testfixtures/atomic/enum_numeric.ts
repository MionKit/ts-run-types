/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
enum Color {
  Red = 0,
  Green = 1,
  Blue = 2,
}
const v: Color = Color.Red;
getRuntypeId<Color>(v);
