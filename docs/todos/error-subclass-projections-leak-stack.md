# Error-subclass projections include inherited name/message/stack (stack leaks to the wire)

## Evidence (found during the mion migration, 2026-07-12)

mion's wire error type is a user class extending Error:

```ts
class TypedError<T extends string> extends Error { readonly type: T; ... }
class RpcError<T extends string, D = any> extends TypedError<T> { publicMessage: string; ... }
```

Encoding an instance with `createJsonEncoder`/`createBinaryEncoder` (typed as the class or a
union containing it) writes the inherited lib-`Error` members alongside the declared props:

```
{"publicMessage":"boom","name":"RpcError","message":"boom","mion@isΣrrθr":true,
 "type":"intentional-error","stack":"RpcError: boom\n    at /home/user/..."}
```

`name`, `message` and — critically — **`stack`** ride the wire. `stack` contains absolute
server file paths and call frames: sending it to clients is an information leak by default,
and it inflates every error payload.

Note the asymmetry with the bare `Error` type, which the id computer already tags
`SubKindNonSerializable` (typeid.go: `IsNonSerializableSymbol`). A SUBCLASS of Error keeps
all of Error's interface members in its structural projection, so the "Error is not
serializable" intent doesn't extend to the inherited members of user error classes.

## Why it matters

Typed error envelopes extending Error are the mainstream pattern (mion's RpcError, most
RPC frameworks). Every consumer that declares one as a wire type today silently ships
stack traces to clients unless they hand-author a projection interface.

## Fix directions (needs a design decision)

- **(a) exclude Error base members (`name`/`message`/`stack`/`cause`) from class
  projections of Error subclasses** — mirrors the existing non-serializable tagging of
  bare Error; a subclass then serializes only its own declared data props. Probably wants
  a Warning diag so the drop is visible.
- **(b) status quo + docs**: document that Error subclasses serialize inherited members
  and recommend a projection interface for wire types.
- (a) with an opt-out (`overrideJsonEncoder` already exists for full control) seems the
  safest default: no stack on the wire unless explicitly requested.

## mion-side interim

mion widened its structural error guards (`isTypedError`/`isRpcError` accept
`name`/`stack` keys) so round-tripped errors are still recognized; the leak itself is
NOT mitigated mion-side yet.

## Acceptance

- Encoding a `class MyError extends Error {code: string}` value writes `code` (+ any
  declared data props) but no `stack` by default, across JSON and binary.
- FE test covering an Error subclass in a union (encode + decode + validate).
