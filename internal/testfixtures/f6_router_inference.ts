/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-run-types';
export {};
const sayHello = (name: string): string => 'Hello ' + name;
const routes = {sayHello};
const myAPI = getRuntypeId(routes);
