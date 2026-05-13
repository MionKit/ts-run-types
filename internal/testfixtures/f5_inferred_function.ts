/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
const add = (a: number, b: number) => a + b;
const info = getRuntypeId(add);
