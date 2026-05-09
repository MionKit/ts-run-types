/// <reference path="./runtypes.d.ts" />
import {getRuntypeId} from '@mionjs/ts-go-run-types';
export {};
interface Tree {
  children: Tree[];
}
declare const t: Tree;
getRuntypeId<Tree>(t);
