package protocol

// EachRefSlot calls visit for every non-nil ref-carrying child slot of
// runType, single slots first, then the slice slots in canonical order.
// This is THE one enumeration of RunType's child-bearing slots: the
// family populator (PopulateFamily), the runtype module dep collector
// (collectRefDeps) and the resolver's per-file scope walk all iterate
// through it, so a slot added to RunType is wired into every walker by
// extending this list alone.
//
// Slot notes (why some seemingly-redundant slots are enumerated):
//   - Extends — interface parents. Properties are already flattened into
//     Children by the TS checker, but the parent refs are only reachable
//     through this slot.
//   - TypeMeta — surviving object-literal types from a collapsed
//     `primitive & {brand}` intersection, reachable only from the branded
//     primitive node.
//   - SafeUnionChildren / UnionDiscriminators — the same ref objects as
//     Children in today's passes; enumerated so a future pass that
//     surfaces extra nodes here is still covered.
func (runType *RunType) EachRefSlot(visit func(*RunType)) {
	for _, slot := range []*RunType{runType.Child, runType.Index, runType.Return, runType.IndexT} {
		if slot != nil {
			visit(slot)
		}
	}
	for _, slots := range [][]*RunType{
		runType.Parameters,
		runType.Children,
		runType.SafeUnionChildren,
		runType.UnionDiscriminators,
		runType.TypeMeta,
		runType.TypeArguments,
		runType.Arguments,
		runType.ExtendsArguments,
		runType.Implements,
		runType.Extends,
	} {
		for _, slot := range slots {
			if slot != nil {
				visit(slot)
			}
		}
	}
}
