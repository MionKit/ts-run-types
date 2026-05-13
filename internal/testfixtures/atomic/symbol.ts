/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
const v: symbol = Symbol("x");
getRuntypeId<symbol>(v);
