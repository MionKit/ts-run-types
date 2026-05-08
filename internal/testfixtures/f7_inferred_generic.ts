/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
function wrap<T>(x: T): T { return x; }
const info = getRuntypeId(wrap({ a: 1, b: "x" }));
