/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
enum Color { Red = "red", Green = "green", Blue = "blue" }
const v: Color = Color.Red;
getRuntypeId<Color>(v);
