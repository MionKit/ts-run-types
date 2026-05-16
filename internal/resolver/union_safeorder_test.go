package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// =========================================================================
// Union safe-order + discriminator pass — per-rule coverage.
//
// Algorithms ported from mion-run-types
// (packages/run-types/src/nodes/collection/unionDiscriminator.ts).
// Coverage matrix lives in
// /root/.claude/plans/intersection-zesty-spindle.md §E.2.
// =========================================================================

// ---- safe-order: subset-related members get sorted by prop count -----------

func TestUnion_SubsetMember_SortedFirst_Static(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {a: string; b: number};
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUnion {
		t.Fatalf("expected KindUnion, got kind=%d", tn.Kind)
	}
	if len(tn.SafeUnionChildren) != 2 {
		t.Fatalf("expected 2 safe-order entries, got %d", len(tn.SafeUnionChildren))
	}
	first := deref(dump(r), tn.SafeUnionChildren[0])
	if first == nil || len(propertyNames(dump(r), first)) != 2 {
		t.Fatalf("expected the 2-prop member first; got %v", first)
	}
}

func TestUnion_SubsetMember_SortedFirst_Reflect(t *testing.T) {
	const code = `import {reflectRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {a: string; b: number};
const v = null as unknown as T;
reflectRuntypeId(v);
`
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUnion {
		t.Fatalf("expected KindUnion, got kind=%d", tn.Kind)
	}
	if len(tn.SafeUnionChildren) != 2 {
		t.Fatalf("expected 2 safe-order entries, got %d", len(tn.SafeUnionChildren))
	}
	first := deref(dump(r), tn.SafeUnionChildren[0])
	if first == nil || len(propertyNames(dump(r), first)) != 2 {
		t.Fatalf("expected the 2-prop member first; got %v", first)
	}
}

func TestUnion_DeepSubsetChain_OrderedByPropCount(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {a: string; b: number} | {a: string; b: number; c: boolean};
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	if len(tn.SafeUnionChildren) != 3 {
		t.Fatalf("expected 3 safe-order entries, got %d", len(tn.SafeUnionChildren))
	}
	sizes := make([]int, 3)
	for i, ref := range tn.SafeUnionChildren {
		sizes[i] = len(propertyNames(dump(r), deref(dump(r), ref)))
	}
	if !(sizes[0] >= sizes[1] && sizes[1] >= sizes[2]) {
		t.Fatalf("expected descending property counts, got %v", sizes)
	}
	if sizes[0] != 3 || sizes[2] != 1 {
		t.Fatalf("expected sizes 3,2,1 in that order, got %v", sizes)
	}
}

// ---- safe-order: unrelated members keep declaration order ------------------

func TestUnion_UnrelatedObjects_KeepDeclarationOrder(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {b: number};
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	if len(tn.SafeUnionChildren) != 2 {
		t.Fatalf("expected 2 safe-order entries, got %d", len(tn.SafeUnionChildren))
	}
	first := deref(dump(r), tn.SafeUnionChildren[0])
	second := deref(dump(r), tn.SafeUnionChildren[1])
	if !containsAll(propertyNames(dump(r), first), "a") {
		t.Fatalf("expected {a} first, got names %v", propertyNames(dump(r), first))
	}
	if !containsAll(propertyNames(dump(r), second), "b") {
		t.Fatalf("expected {b} second, got names %v", propertyNames(dump(r), second))
	}
}

// ---- safe-order: SafeUnionPosition on each ref child -----------------------

func TestUnion_SafeUnionPositionOnEachChild(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {a: string; b: number};
getRuntypeId<T>();
`
	_, tn := resolveInline(t, code)
	for i, ref := range tn.Children {
		if ref.SafeUnionPosition == nil {
			t.Fatalf("child %d missing SafeUnionPosition", i)
		}
	}
}

// ---- safe-order: position points at the safe-order slot --------------------

func TestUnion_SafeUnionPositionPointsAtSafeOrder(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {a: string; b: number} | {x: boolean};
getRuntypeId<T>();
`
	_, tn := resolveInline(t, code)
	if len(tn.Children) != len(tn.SafeUnionChildren) {
		t.Fatalf("Children %d ≠ SafeUnionChildren %d", len(tn.Children), len(tn.SafeUnionChildren))
	}
	for _, ref := range tn.Children {
		if ref.SafeUnionPosition == nil {
			t.Fatalf("child %s missing SafeUnionPosition", ref.ID)
		}
		slot := *ref.SafeUnionPosition
		if slot < 0 || slot >= len(tn.SafeUnionChildren) {
			t.Fatalf("SafeUnionPosition %d out of range [0..%d)", slot, len(tn.SafeUnionChildren))
		}
		if tn.SafeUnionChildren[slot] != ref {
			t.Fatalf("safeUnionChildren[%d] does not match the ref it points to", slot)
		}
	}
}

// ---- safe-order: any goes last ---------------------------------------------

func TestUnion_AnyMember_GoesLast(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = string | number | any;
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	// `string | number | any` collapses to `any` at the checker level, so we
	// may receive just KindAny. Otherwise the safe order must end in any.
	if tn.Kind == protocol.KindAny {
		return
	}
	if len(tn.SafeUnionChildren) == 0 {
		t.Fatalf("expected safe order entries")
	}
	last := deref(dump(r), tn.SafeUnionChildren[len(tn.SafeUnionChildren)-1])
	if last == nil || last.Kind != protocol.KindAny {
		t.Fatalf("expected last safe order entry to be any, got %+v", last)
	}
}

func TestUnion_UnknownMember_GoesLast(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | unknown;
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	// `T | unknown` may collapse to `unknown`. Accept either form.
	if tn.Kind == protocol.KindUnknown {
		return
	}
	if len(tn.SafeUnionChildren) == 0 {
		t.Fatalf("expected safe order entries")
	}
	last := deref(dump(r), tn.SafeUnionChildren[len(tn.SafeUnionChildren)-1])
	if last == nil || last.Kind != protocol.KindUnknown {
		t.Fatalf("expected last safe order entry to be unknown, got %+v", last)
	}
}

// ---- safe-order: multiple any get deduped (first kept) ---------------------

func TestUnion_MultipleAnyMembers_KeepsFirstOnly(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = string | any | any;
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	// TS collapses `X | any | any` to `any` — that's fine. Otherwise count
	// how many any/unknown entries appear in safe order.
	if tn.Kind == protocol.KindAny {
		return
	}
	anyCount := 0
	for _, ref := range tn.SafeUnionChildren {
		canonical := deref(dump(r), ref)
		if canonical != nil && (canonical.Kind == protocol.KindAny || canonical.Kind == protocol.KindUnknown) {
			anyCount++
		}
	}
	if anyCount > 1 {
		t.Fatalf("expected at most 1 any/unknown in safe order, got %d", anyCount)
	}
}

// ---- safe-order: bucket ordering simple → objects ------------------------

func TestUnion_SimpleAndObjects_BucketOrder(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = number | {a: string} | {a: string; b: number};
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUnion {
		t.Fatalf("expected KindUnion, got %d", tn.Kind)
	}
	if len(tn.SafeUnionChildren) != 3 {
		t.Fatalf("expected 3 safe order entries, got %d", len(tn.SafeUnionChildren))
	}
	first := deref(dump(r), tn.SafeUnionChildren[0])
	if first == nil || first.Kind != protocol.KindNumber {
		t.Fatalf("expected simple-bucket (number) first, got %+v", first)
	}
	// Position 1: 2-prop object (more specific). Position 2: 1-prop object.
	mid := deref(dump(r), tn.SafeUnionChildren[1])
	last := deref(dump(r), tn.SafeUnionChildren[2])
	if mid == nil || last == nil {
		t.Fatalf("missing object members in safe order")
	}
	if len(propertyNames(dump(r), mid)) != 2 || len(propertyNames(dump(r), last)) != 1 {
		t.Fatalf("expected 2-prop then 1-prop after simple, got %d / %d",
			len(propertyNames(dump(r), mid)), len(propertyNames(dump(r), last)))
	}
}

// ---- safe-order: degenerate single-member union ---------------------------

func TestUnion_SingleMember_Degenerate(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = string | string;
getRuntypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind == protocol.KindString {
		// TS deduplicates trivially-identical members to the bare primitive.
		return
	}
	if tn.Kind != protocol.KindUnion {
		t.Fatalf("expected KindUnion or KindString, got %d", tn.Kind)
	}
	if len(tn.Children) > 1 && len(tn.SafeUnionChildren) != len(tn.Children) {
		t.Fatalf("degenerate union safe-order must mirror children")
	}
}

// ---- safe-order: nested unions flatten via Distributed() ------------------

func TestUnion_NestedUnion_FlattenedByDistributed(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type AB = 'a' | 'b';
type T = AB | 'c';
getRuntypeId<T>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindUnion {
		t.Fatalf("expected KindUnion, got kind=%d", tn.Kind)
	}
	if len(tn.Children) != 3 {
		t.Fatalf("expected 3 flattened union members, got %d", len(tn.Children))
	}
	if len(tn.SafeUnionChildren) != 3 {
		t.Fatalf("expected 3 safe-order entries, got %d", len(tn.SafeUnionChildren))
	}
}

// ---- discriminator: shared-name kind literal --------------------------------

func TestUnionDiscriminator_NamedSharedField_LiteralKind(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {kind: 'a'; x: number} | {kind: 'b'; y: string};
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	// Walk all object members; verify the `kind` property on each is marked.
	marks := 0
	totalKindProps := 0
	for _, ref := range tn.Children {
		obj := deref(dump(r), ref)
		if obj == nil || (obj.Kind != protocol.KindObjectLiteral && obj.Kind != protocol.KindClass) {
			continue
		}
		for _, propRef := range obj.Children {
			prop := deref(dump(r), propRef)
			if prop == nil || prop.Name != "kind" {
				continue
			}
			totalKindProps++
			if prop.IsUnionDiscriminator {
				marks++
			}
		}
	}
	if totalKindProps != 2 || marks != 2 {
		t.Fatalf("expected both kind props marked discriminator (2/2), got %d/%d", marks, totalKindProps)
	}
}

// ---- discriminator: pick least-complex shared name --------------------------
// Two qualifying shared-name discriminators exist (k1, k2); both members'
// types match by-name with distinct types per member. Only one name should
// be picked (the least-complex one).

func TestUnionDiscriminator_NamedShared_PicksLeastComplex(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {k1: 'a'; k2: {nested: {deep: 1}}; x: number}
       | {k1: 'b'; k2: {nested: {deep: 2}}; y: string};
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	k1Marks, k2Marks := 0, 0
	for _, ref := range tn.Children {
		obj := deref(dump(r), ref)
		if obj == nil {
			continue
		}
		for _, propRef := range obj.Children {
			prop := deref(dump(r), propRef)
			if prop == nil {
				continue
			}
			if prop.Name == "k1" && prop.IsUnionDiscriminator {
				k1Marks++
			}
			if prop.Name == "k2" && prop.IsUnionDiscriminator {
				k2Marks++
			}
		}
	}
	if k1Marks != 2 {
		t.Fatalf("expected k1 (least-complex) marked on both members, got %d", k1Marks)
	}
	if k2Marks != 0 {
		t.Fatalf("expected k2 (more-complex) NOT marked, got %d marks", k2Marks)
	}
}

// ---- discriminator: no shared name → falls back to unique-prop -------------

func TestUnionDiscriminator_NoSharedName_UsesUniqueProp(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: string} | {b: number};
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	aMarked, bMarked := false, false
	for _, ref := range tn.Children {
		obj := deref(dump(r), ref)
		if obj == nil {
			continue
		}
		for _, propRef := range obj.Children {
			prop := deref(dump(r), propRef)
			if prop == nil {
				continue
			}
			if prop.Name == "a" && prop.IsUnionDiscriminator {
				aMarked = true
			}
			if prop.Name == "b" && prop.IsUnionDiscriminator {
				bMarked = true
			}
		}
	}
	if !aMarked || !bMarked {
		t.Fatalf("expected both unique props marked: a=%v b=%v", aMarked, bMarked)
	}
}

// ---- discriminator: shared name with same type doesn't qualify ------------

func TestUnionDiscriminator_SharedNonUniqueType_NotMarked(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {kind: string; x: 1} | {kind: string; y: 2};
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	kindMarks := 0
	for _, ref := range tn.Children {
		obj := deref(dump(r), ref)
		if obj == nil {
			continue
		}
		for _, propRef := range obj.Children {
			prop := deref(dump(r), propRef)
			if prop == nil {
				continue
			}
			if prop.Name == "kind" && prop.IsUnionDiscriminator {
				kindMarks++
			}
		}
	}
	if kindMarks != 0 {
		t.Fatalf("expected kind NOT marked (same type-id across members), got %d marks", kindMarks)
	}
}

// ---- discriminator: no objects, no discriminator marks ---------------------

func TestUnionDiscriminator_NoObjects_NoDiscriminator(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = string | number;
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	for _, ref := range tn.Children {
		canonical := deref(dump(r), ref)
		if canonical == nil {
			continue
		}
		if canonical.IsUnionDiscriminator {
			t.Fatalf("primitive member %s incorrectly marked as discriminator", canonical.ID)
		}
	}
}

// ---- discriminator: single-prop members → unique prop wins -----------------

func TestUnionDiscriminator_SinglePropMembers_MarksUniqueProp(t *testing.T) {
	const code = `import {getRuntypeId} from '@mionjs/ts-go-run-types';
type T = {a: 1} | {b: 2};
getRuntypeId<T>();
`
	r, tn := resolveInline(t, code)
	aMarked, bMarked := false, false
	for _, ref := range tn.Children {
		obj := deref(dump(r), ref)
		if obj == nil {
			continue
		}
		for _, propRef := range obj.Children {
			prop := deref(dump(r), propRef)
			if prop == nil {
				continue
			}
			if prop.Name == "a" && prop.IsUnionDiscriminator {
				aMarked = true
			}
			if prop.Name == "b" && prop.IsUnionDiscriminator {
				bMarked = true
			}
		}
	}
	if !aMarked || !bMarked {
		t.Fatalf("expected both single-prop members to mark their prop: a=%v b=%v", aMarked, bMarked)
	}
}
