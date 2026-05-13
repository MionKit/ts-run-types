/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
const makeUser = (id: number, name: string) => ({ id, name });
const u = makeUser(1, "m");
const info = getRuntypeId(u);
