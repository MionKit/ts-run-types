import {createPrepareForJson, createRestoreFromJson} from '@ts-runtypes/core';

type Payload = {id: bigint; createdAt: Date; name: string};

// prepare: a typed value becomes a JSON-safe value (bigint to string, Date kept).
// restore: a JSON-safe value becomes the typed shape again (BigInt(...), Date).
const prepare = createPrepareForJson<Payload>();
const restore = createRestoreFromJson<Payload>();

const value: Payload = {id: 42n, createdAt: new Date(), name: 'Ada'};

// You own the envelope: place the prepared value where you want, stringify once.
const wire = JSON.stringify({data: prepare(value)});

// On the other side, parse once, then restore the piece you need.
const parsed = JSON.parse(wire) as {data: unknown};
const back = restore(parsed.data) as Payload;

export {prepare, restore, wire, back};
