# registerClassSerializer covers only ONE instantiation of a generic class — DONE

## Original finding (mion migration, 2026-07-12)

mion's wire error type is a generic class (`RpcError<ErrType extends string, ErrData>`),
registered once as `registerClassSerializer<RpcError<string>>(RpcError, {...})`. Only that
exact instantiation reconstructed; `createJsonDecoderFn<RpcError<'other', {n: number}>>()`
decoded to a PLAIN OBJECT (structural fallback) because:

1. the registry was keyed by the registration site's injected instantiation TYPE ID, and
   every generic instantiation hashes to a different id;
2. `classToKey` held ONE key per class and re-registering DELETED the prior entry, so
   registering each instantiation explicitly didn't work either.

## What shipped (direction: the class drives the registry — generics are not runtime)

Generics are erased at runtime: every instantiation of `RpcError<…>` is the SAME class
object, so ONE `registerClassSerializer(RpcError, …)` (the API already takes the class
object itself) now covers every instantiation the program uses.

**Encouraged form (review follow-up): no type argument at all** —
`registerClassSerializer(RpcError, {deserialize: …})`. The instantiation the compiler
infers for a bare generic registration is incidental by design (verified: its injected
id is not even `RpcError<string>`'s — coverage comes from the name lane, never the
registration-site id). The explicit `registerClassSerializer<RpcError<string>>(…)` form
was only ever needed under the old id-keyed registry and now adds nothing; JSDoc and
the tests encourage the bare form.

- **Emitters** ([ts-go-runtypes/internal/cachegen/typefunctions/class_serializer.go] +
  the flat-union class-identity dispatch in union_flat_layout.go) now bake TWO build-time
  literals into every lookup: `utl.getClassSerializer('<rt.ID>', '<rt.TypeName>')` — the
  exact instantiation id plus the class name.
- **Registry** ([packages/ts-runtypes/src/runtypes/classSerializerRegistry.ts]) keys each
  registration under the exact id AND a class-name fallback lane. The name comes from the
  registered type's reflected node (`node.typeName`, a build-time string — never runtime
  `cls.name`, so minification cannot skew the pairing; the manual bare-string-id escape
  hatch falls back to `cls.name` and is documented as not minification-safe).
- **Lookup order**: exact instantiation id first, then the name lane. Old emitted bodies
  (single-arg lookups) keep exact-id behavior.
- **Eviction bug fixed**: per-class state holds a SET of keys and one shared entry object —
  re-registering (any instantiation) updates handlers everywhere and never drops keys.
- **Name collisions**: two DIFFERENT classes sharing a name disable that name's fallback
  lane (console warning, once); exact-id matches keep routing for both. Unregistering one
  makes the name routable again.
- **Disk cache**: FormatVersion bumped 12 → 13 (class arms emit new lookup bytes; stale
  single-arg payloads must miss).

## Acceptance shipped

FE suite `packages/ts-runtypes/test/features/classSerializerGenerics.test.ts` (RpcError-like
`WireError<Code extends string, Data>` per the review direction):

- a single registration reconstructs a NON-registered instantiation through JSON (static +
  value-inferred call shapes), through binary, and as a union member (`instanceof` holds);
- re-registration under a second instantiation keeps BOTH ids routable (the old eviction
  case) with last-registered handlers winning;
- same-name/different-class ambiguity: warn once, name lane disabled, exact ids still
  route, unregistering one restores the name lane;
- `getRunTypeId` pinned in both call shapes: instantiations hash to DIFFERENT ids (the very
  reason the name lane exists) while equivalent T converges.

Existing `classSerializer.test.ts` + `classSerializerUnion.test.ts` (38 tests) pass
unchanged.
