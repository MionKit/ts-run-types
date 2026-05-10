// Helper for consumers walking the discriminator slot on union RunTypes
// emitted by the vite-plugin-runtypes cache.
//
// The wire format stores discriminator info as a parallel-to-
// `safeUnionChildren` ref array on the union node — only the strictly
// new field (the chosen property per member) is carried; everything
// else mion's `FlattenedProp` shape needs is reconstructible from the
// surrounding context. This helper does that reconstruction in one
// pass and returns the materialised per-member struct directly.
//
// See docs/ROADMAP.md → "Union discriminator wire shape" for the
// rationale; the detection passes themselves live on the Go side at
// internal/serialize/union_safeorder.go.

/** Structural shape of a node we treat as a discriminator property —
 * carries the property's name (the JS key consumers switch on at
 * validation time) and a child slot whose `.id` is the property's
 * declared type id. Any RunType emitted by the plugin satisfies this. */
export interface DiscriminatorPropLike {
  name?: string;
  child?: {id?: string} | null;
}

/** Structural shape of a union RunType — just the two slots the
 * helper reads. Any union RunType emitted by the plugin satisfies this. */
export interface DiscriminatorUnionLike<Member, Prop> {
  safeUnionChildren?: Member[] | null;
  unionDiscriminators?: (Prop | null | undefined)[] | null;
}

/** Per-member discriminator record. Mirrors mion's `FlattenedProp` minus
 * the codegen-local `compiledName` (which is a JS local-variable name
 * allocated by the consumer, not wire data). */
export interface FlattenedDiscriminator<Member, Prop> {
  /** The union member this entry describes — same ref as `safeUnionChildren[unionIndex]`. */
  unionItem: Member;
  /** 0-based slot in `safeUnionChildren` / `unionDiscriminators`. */
  unionIndex: number;
  /** Ref to the discriminator property within `unionItem`. `undefined`
   * for non-object members (simple / any) and for any member the
   * detection pass couldn't resolve. */
  prop: Prop | undefined;
  /** The property's declared type id — i.e. `prop.child.id`. `undefined`
   * whenever `prop` is. */
  typeID: string | undefined;
}

/**
 * Materialise the per-member discriminator records for a union RunType.
 * Returns one entry per `safeUnionChildren` slot; non-object slots get
 * a record whose `prop` and `typeID` are `undefined`. Returns an empty
 * array when the union has no `safeUnionChildren` (degenerate unions).
 *
 * Example:
 *
 *     const flat = flattenUnionDiscriminators(union);
 *     for (const {unionItem, prop, typeID} of flat) {
 *       if (!prop) continue; // non-object slot
 *       // emit a switch arm: case value[prop.name] === <typeID literal> → unionItem
 *     }
 */
export function flattenUnionDiscriminators<
  Member,
  Prop extends DiscriminatorPropLike,
>(union: DiscriminatorUnionLike<Member, Prop>): FlattenedDiscriminator<Member, Prop>[] {
  const members = union.safeUnionChildren ?? [];
  const discriminators = union.unionDiscriminators ?? [];
  return members.map((unionItem, unionIndex) => {
    const prop = discriminators[unionIndex] ?? undefined;
    return {
      unionItem,
      unionIndex,
      prop,
      typeID: prop?.child?.id,
    };
  });
}
