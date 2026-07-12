# registerClassSerializer covers only ONE instantiation of a generic class

## Evidence (found during the mion migration, 2026-07-12)

mion's wire error type is a generic class:

```ts
class RpcError<ErrType extends string, ErrData = any> extends TypedError<ErrType> { ... }
```

Registered once:

```ts
registerClassSerializer<RpcError<string>>(RpcError, {deserialize: (data) => new RpcError(data)});
```

- `createJsonDecoder<RpcError<string>>()` reconstructs a real instance (also inside unions). ✅
- `createJsonDecoder<RpcError<'other', {n: number}>>()` decodes to a PLAIN OBJECT (structural
  fallback, CLS001 lane) — `instanceof RpcError` is false. ❌

Two independent causes in [packages/ts-runtypes/src/runtypes/classSerializerRegistry.ts]:

1. The registry is keyed by the registration site's injected TYPE ID. A custom class id is
   `KindClass{<member ids>}#ClassName` (typeid.go objectID), so every generic instantiation
   hashes to a DIFFERENT id — `RpcError<'validation-error', ValidationErrorData>` never hits
   the `RpcError<string>` entry that emitted code looks up via `utl.getClassSerializer('<rt.ID>')`.
2. `classToKey` holds ONE key per class and `registerClassSerializer` DELETES the prior entry
   when the same class re-registers under a new id — so consumers cannot even work around it
   by registering each instantiation they use.

Reproduction pinned in mion: `packages/run-types/src/mionClassSerializers.spec.ts`
("other generic instantiations fall back to structural data").

## Why it matters

Generic classes as wire types are a common pattern (typed error envelopes, Result<T>,
Page<T>). Today the feature silently degrades to the structural fallback for all but one
instantiation, with only a build-time CLS001 Warning that fires per-type, not per-registration.

## Fix directions (needs a design decision)

- **(a) classRef-name fallback in `getClassSerializer`**: on exact-id miss, parse the
  `#ClassName` suffix off the runtype id and consult a name-keyed secondary index
  (`registerClassSerializer` already has the class value; index by `cls.name`). Name
  collisions across modules would need the same "already registered" guard mion's old
  registry had. No emit changes; pure runtime.
- **(b) allow multiple keys per class**: turn `classToKey` into `Map<cls, Set<key>>` so each
  used instantiation can be registered explicitly (verbose for consumers, but unblocks
  today's API without design risk). (a) and (b) compose.
- **(c) fold a nominal classRef into the projected node + registry** so lookups key on the
  class, not the instantiation id — bigger change (protocol + emitters).

## Acceptance

- A single `registerClassSerializer<RpcError<string>>(RpcError, {...})` (or a documented
  small number of registrations) makes EVERY instantiation of `RpcError` reconstruct through
  JSON and binary decoders, including union members.
- FE tests cover: two instantiations of one generic class, a union containing one, and the
  eviction case (registering twice must not silently drop the first key).
