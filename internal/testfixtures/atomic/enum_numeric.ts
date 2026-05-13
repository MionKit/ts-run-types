/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
enum Color { Red = 0, Green = 1, Blue = 2 }
const v: Color = Color.Red;
getRuntypeId<Color>(v);
