/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
interface M { [k: string]: number }
declare const m: M;
getRuntypeId<M>(m);
