/// <reference path="./runtypes.d.ts" />
import { getRuntypeId } from "@mionkit/runtypes";
export {};
type User = { id: number; name: string };
const u = { id: 1, name: "m" } as User;
getRuntypeId<User>(u);
