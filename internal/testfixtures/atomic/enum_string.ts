/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
enum Color {
  Red = 'red',
  Green = 'green',
  Blue = 'blue',
}
const v: Color = Color.Red;
getRuntypeId<Color>(v);
