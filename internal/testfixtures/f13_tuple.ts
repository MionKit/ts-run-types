/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
const tup: [number, string?] = [1];
const info = getRuntypeId(tup);
