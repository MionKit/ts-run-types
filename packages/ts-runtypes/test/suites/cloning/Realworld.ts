// cloning / Realworld — a payload-shaped composition exercising every arm at
// once (nested object, array, Map, Date), the intended validate-then-clone
// pipeline shape. The generic asserts prove the clone shares no mutable
// reference with the input at ANY depth — which is exactly the guarantee
// that makes mutating the clone safe.

import {createCloneExactShape} from '@ts-runtypes/core';
import type {CloningCase} from './types.ts';

export interface Payload {
  id: number;
  nested: {tag: string; when: Date};
  tags: string[];
  index: Map<string, number>;
}

export function makePayload(extras: boolean): Payload {
  const payload: Payload = {
    id: 1,
    nested: {tag: 't', when: new Date('2021-05-06T07:08:09.000Z')},
    tags: ['a'],
    index: new Map([['k', 1]]),
  };
  if (extras) {
    (payload.nested as unknown as Record<string, unknown>).extra = 1;
    (payload as unknown as Record<string, unknown>).evil = true;
  }
  return payload;
}

export const REALWORLD = {
  payload: {
    title: 'API payload',
    description:
      'A realistic parse-output shape: nested object, tags array, Map index, Date stamp. Every mutable position of the clone is a fresh identity, so downstream code can mutate freely.',
    clone: () => createCloneExactShape<Payload>(),
    getTestData: () => ({
      values: [makePayload(false), makePayload(true)],
      expected: [makePayload(false), makePayload(false)],
    }),
  },
} satisfies Record<string, CloningCase>;
