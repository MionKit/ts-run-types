/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
const v: Date = new Date();
getRuntypeId<Date>(v);
