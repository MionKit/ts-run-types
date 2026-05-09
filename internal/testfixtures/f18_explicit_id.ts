/// <reference path="./runtypes.d.ts" />
import {getRuntypeId, type RuntypeId} from '@mionjs/ts-go-run-types';

export {};

// 18a — caller passes an explicit string literal at the id slot. The
// scanner must NOT emit a site here — rewriting would append a stray
// extra argument past the id slot.
const u = {id: 1, name: 'm'} as {id: number; name: string};
const a = getRuntypeId(u, 'manualHash');

// 18b — caller passes an explicit literal at slot 1 with `undefined` at
// slot 0. Same rule: the id slot is occupied, leave the call alone.
const b = getRuntypeId<string>(undefined, 'manualHash');

// 18c — user-defined wrapper, caller already supplies the id.
function isType<T>(_v: unknown, id?: RuntypeId<T>): RuntypeId<T> {
  if (!id) throw new Error('transformer not active');
  return id;
}
const c = isType<{flag: boolean}>(true, 'manualHash');
