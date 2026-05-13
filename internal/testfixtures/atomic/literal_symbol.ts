/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
const sym: unique symbol = Symbol("hello");
getRuntypeId<typeof sym>(sym);
