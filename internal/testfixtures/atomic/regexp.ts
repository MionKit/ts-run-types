/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
const v: RegExp = /abc/i;
getRuntypeId<RegExp>(v);
