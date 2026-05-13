/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
const v: "hello" = "hello";
getRuntypeId<"hello">(v);
