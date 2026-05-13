/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
declare const p: Promise<number>;
const info = getRuntypeId(p);
