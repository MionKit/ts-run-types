# Error-subclass projections include inherited name/message/stack (stack leaks to the wire) — DONE

> **SUPERSEDED (2026-07-13)** by
> [runtime-enumerability-checks-for-global-props.md](runtime-enumerability-checks-for-global-props.md):
> the hard `stack`-only exclusion below was replaced by a general runtime
> own-enumerability guard over the OPTIONAL lib-global-inherited members (`stack?` /
> `cause?`) plus `@nonEnumerable`-tagged optional user props. `stack` is no longer
> excluded from the projection — it is a guarded member, dropped at runtime unless made
> enumerable. The "`name`/`message` deliberately stay projected" decision recorded here
> STANDS: they are required in `Error`, so they are not guarded and always serialize
> (guarding a required member would break `DataOnly<T>`).

## Original finding (mion migration, 2026-07-12)

User classes extending Error (`class RpcError<T, D> extends TypedError<T>`) serialized
the inherited lib-`Error` members alongside their declared props — `name`, `message` and
critically **`stack`** rode the wire on every JSON/binary encode. `stack` contains
absolute server file paths and call frames: an information leak by default. The emitters
materialize declared props by name (`v.stack`), so even the non-enumerable stack property
shipped. Bare `Error` was already tagged SubKindNonSerializable, but the intent didn't
extend to inherited members of user error subclasses.

## What shipped (option (a), scoped to the leak vector)

**`stack` inherited from the default-lib `Error` interface is excluded from class
projections** — dropped from both the projection
([serialize.go projectMembersInto], alongside the existing synthesized-`prototype` skip)
and the structural id ([typeid.go memberIDs] via the shared exported
`typeid.IsLibErrorStack`), so id and projection can't drift. The exclusion requires EVERY
declaration of the member to come from `interface Error` in a default lib file
(`lib.*.d.ts`), so:

- a user class REDECLARING `stack` as an own data prop keeps it (deliberate opt-in);
- a user's own `interface Error` outside the lib is unaffected.

**`name` and `message` deliberately stay projected** (narrower than the todo's original
option (a) list): they are the error envelope's real wire data — clients rely on
`message` — and carry no leak potential. `cause` (es2022, typed `unknown`) also stays:
identity-encoded, and an Error VALUE under it does not leak its stack through native
JSON (non-enumerable own prop).

No new diagnostic: the exclusion is structural (same lane as the `prototype` skip), and
`stack` is absent from the reflected shape rather than warned per family.

## Acceptance shipped

FE suite `packages/ts-runtypes/test/features/errorSubclassWire.test.ts`
(`class WireCodeError extends Error {code}`):

- reflected node keeps `code`/`name`/`message`, never `stack` (graph-level assert);
- JSON encode writes code/name/message, no `stack` anywhere in the output;
- binary round-trip carries declared data, no stack;
- union member case encodes/decodes without stack;
- validate accepts wire-shaped values with no stack key;
- both `getRunTypeId` call shapes converge (marker rule).

## mion follow-up (documented, not in this repo)

mion widened `isTypedError`/`isRpcError` allowlists to accept `stack` on round-tripped
errors — after upgrading, wire errors no longer carry `stack` and the allowlist entry
can be dropped (it stays harmless meanwhile).
