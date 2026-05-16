package serialize

import (
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// finalizeUnion runs once after a union's children are serialized. It:
//
//  1. Buckets children into simple / object-like / any (per mion's
//     splitUnionItems);
//  2. Reorders the object-like bucket so superset shapes precede their
//     subset equivalents (per mion's sortUnreachableTypes) — prevents
//     unreachable union members at validate time;
//  3. Records the resulting order on the union's SafeUnionChildren slice
//     and stamps each child ref with its SafeUnionPosition;
//  4. Runs the discriminator pass — marks property nodes that can serve
//     as a fast-path discriminator for the union (named-shared or
//     unique-prop).
//
// Children are ref RunTypes (Kind == KindRef) pointing at canonical
// entries in cache.nodes. We inspect the canonical entry but write
// SafeUnionPosition onto the ref wrapper so the same canonical node can
// hold different positions in different parent unions.
func (cache *Cache) finalizeUnion(node *protocol.RunType) {
	if len(node.Children) <= 1 {
		// Degenerate union — nothing to reorder, nothing to discriminate.
		return
	}

	simpleItems, objectRefs, anyItem := cache.splitUnionItems(node.Children)
	sortedObjects := cache.sortUnreachableTypes(objectRefs)

	safeOrder := make([]*protocol.RunType, 0, len(node.Children))
	safeOrder = append(safeOrder, simpleItems...)
	safeOrder = append(safeOrder, sortedObjects...)
	if anyItem != nil {
		safeOrder = append(safeOrder, anyItem)
	}
	node.SafeUnionChildren = safeOrder

	// Map ref → safe position. Since refs in node.Children are the same
	// pointers as those in safeOrder (we never copy), pointer-identity
	// lookup is sufficient.
	for i, ref := range safeOrder {
		position := i
		ref.SafeUnionPosition = &position
	}

	cache.markDiscriminators(sortedObjects)
}

// splitUnionItems mirrors mion's splitUnionItems
// (packages/run-types/src/nodes/collection/unionDiscriminator.ts:36-58):
// object-like members go to objectRefs, atomics to simpleItems, and the
// first any/unknown member is held aside for last-position placement.
// Subsequent any/unknown members are kept in their bucket (duplicates
// would already have been deduped by the TS checker, but we don't
// re-emit a separate any node — mion's algorithm drops them silently).
func (cache *Cache) splitUnionItems(children []*protocol.RunType) (simpleItems, objectRefs []*protocol.RunType, anyItem *protocol.RunType) {
	for _, ref := range children {
		canonical := cache.nodes[ref.ID]
		if canonical == nil {
			simpleItems = append(simpleItems, ref)
			continue
		}
		switch canonical.Kind {
		case protocol.KindAny, protocol.KindUnknown:
			if anyItem == nil {
				anyItem = ref
			}
			// duplicates dropped per mion's "Only keep the first" comment
		case protocol.KindObjectLiteral, protocol.KindClass:
			objectRefs = append(objectRefs, ref)
		default:
			simpleItems = append(simpleItems, ref)
		}
	}
	return
}

// sortUnreachableTypes is a Go port of mion's sortUnreachableTypes
// (unionDiscriminator.ts:69-116). Object-like members whose property
// type-id sets are subset-related to one another get grouped, then the
// group is sorted descending by property count so the most-specific
// shape is validated first. Unrelated members keep their declaration
// order.
func (cache *Cache) sortUnreachableTypes(objectRefs []*protocol.RunType) []*protocol.RunType {
	if len(objectRefs) <= 1 {
		return objectRefs
	}

	// Pre-compute the property type-id set for each object member.
	propSets := make([]map[string]struct{}, len(objectRefs))
	for i, ref := range objectRefs {
		propSets[i] = cache.propertyTypeIDSet(ref)
	}

	isSubsetOf := func(smallerIdx, largerIdx int) bool {
		smaller := propSets[smallerIdx]
		larger := propSets[largerIdx]
		if len(smaller) >= len(larger) {
			return false
		}
		for typeID := range smaller {
			if _, ok := larger[typeID]; !ok {
				return false
			}
		}
		return true
	}

	processed := make([]bool, len(objectRefs))
	result := make([]*protocol.RunType, 0, len(objectRefs))

	for i := 0; i < len(objectRefs); i++ {
		if processed[i] {
			continue
		}
		groupIdx := []int{i}
		processed[i] = true
		for j := 0; j < len(objectRefs); j++ {
			if i == j || processed[j] {
				continue
			}
			if isSubsetOf(i, j) || isSubsetOf(j, i) {
				groupIdx = append(groupIdx, j)
				processed[j] = true
			}
		}
		if len(groupIdx) > 1 {
			// Sort descending by property count (more props first).
			// Stable: when sizes match, original order wins.
			for outer := 1; outer < len(groupIdx); outer++ {
				key := groupIdx[outer]
				keySize := len(propSets[key])
				inner := outer - 1
				for inner >= 0 && len(propSets[groupIdx[inner]]) < keySize {
					groupIdx[inner+1] = groupIdx[inner]
					inner--
				}
				groupIdx[inner+1] = key
			}
		}
		for _, idx := range groupIdx {
			result = append(result, objectRefs[idx])
		}
	}
	return result
}

// propertyTypeIDSet returns the set of property type-ids on an
// object-like canonical node. The "type-id" of a property is the id of
// its child type — same value mion's PropertyRunType.getTypeID() returns
// at the runtype layer.
func (cache *Cache) propertyTypeIDSet(ref *protocol.RunType) map[string]struct{} {
	out := make(map[string]struct{})
	canonical := cache.nodes[ref.ID]
	if canonical == nil {
		return out
	}
	for _, childRef := range canonical.Children {
		memberNode := cache.nodes[childRef.ID]
		if memberNode == nil {
			continue
		}
		if memberNode.Kind != protocol.KindProperty && memberNode.Kind != protocol.KindPropertySignature {
			continue
		}
		if memberNode.Child != nil {
			out[memberNode.Child.ID] = struct{}{}
		}
	}
	return out
}

// markDiscriminators marks suitable property nodes as
// IsUnionDiscriminator. Mirrors mion's markDiscriminators +
// getDiscriminatorProperties + getUniqueDiscriminatorProperties (
// unionDiscriminator.ts:122-251).
func (cache *Cache) markDiscriminators(objectRefs []*protocol.RunType) {
	if len(objectRefs) < 2 {
		return
	}
	if !cache.markSharedNameDiscriminator(objectRefs) {
		cache.markUniquePropDiscriminator(objectRefs)
	}
}

// markSharedNameDiscriminator finds the lowest-cost property name shared
// across every object member whose type-id is unique per member.
// Reports true when at least one qualifying name was marked.
func (cache *Cache) markSharedNameDiscriminator(objectRefs []*protocol.RunType) bool {
	type propEntry struct {
		propNode *protocol.RunType
		typeID   string
	}
	byName := make(map[string][]propEntry)
	for _, ref := range objectRefs {
		canonical := cache.nodes[ref.ID]
		if canonical == nil {
			return false
		}
		for _, childRef := range canonical.Children {
			memberNode := cache.nodes[childRef.ID]
			if memberNode == nil {
				continue
			}
			if memberNode.Kind != protocol.KindProperty && memberNode.Kind != protocol.KindPropertySignature {
				continue
			}
			childID := ""
			if memberNode.Child != nil {
				childID = memberNode.Child.ID
			}
			byName[memberNode.Name] = append(byName[memberNode.Name], propEntry{memberNode, childID})
		}
	}

	type candidate struct {
		name    string
		entries []propEntry
		// complexity proxy — count of children transitively walked.
		// We use the entries' raw type-id strings sorted as a stable
		// secondary key, then prefer the candidate whose total
		// summed-length-of-typeids is smallest (least complex).
		complexity int
	}
	var candidates []candidate
	for name, entries := range byName {
		if len(entries) != len(objectRefs) {
			continue
		}
		// Each entry's type-id must be unique among the group's entries.
		typeIDs := make(map[string]int, len(entries))
		for _, entry := range entries {
			typeIDs[entry.typeID]++
		}
		allDistinct := true
		for _, count := range typeIDs {
			if count != 1 {
				allDistinct = false
				break
			}
		}
		if !allDistinct {
			continue
		}
		comp := 0
		for _, entry := range entries {
			comp += len(entry.typeID)
		}
		candidates = append(candidates, candidate{name: name, entries: entries, complexity: comp})
	}
	if len(candidates) == 0 {
		return false
	}
	pick := candidates[0]
	for _, cand := range candidates[1:] {
		if cand.complexity < pick.complexity ||
			(cand.complexity == pick.complexity && cand.name < pick.name) {
			pick = cand
		}
	}
	for _, entry := range pick.entries {
		entry.propNode.IsUnionDiscriminator = true
	}
	return true
}

// markUniquePropDiscriminator marks, per object member, one property
// whose type-id is unique across all other members in the union. If
// multiple unique properties exist on a member, the one with the
// shortest (least-complex) type-id wins.
func (cache *Cache) markUniquePropDiscriminator(objectRefs []*protocol.RunType) {
	memberProps := make([][]*protocol.RunType, len(objectRefs))
	memberTypeIDs := make([]map[string]struct{}, len(objectRefs))
	for i, ref := range objectRefs {
		canonical := cache.nodes[ref.ID]
		if canonical == nil {
			continue
		}
		ids := make(map[string]struct{})
		var props []*protocol.RunType
		for _, childRef := range canonical.Children {
			memberNode := cache.nodes[childRef.ID]
			if memberNode == nil {
				continue
			}
			if memberNode.Kind != protocol.KindProperty && memberNode.Kind != protocol.KindPropertySignature {
				continue
			}
			props = append(props, memberNode)
			if memberNode.Child != nil {
				ids[memberNode.Child.ID] = struct{}{}
			}
		}
		memberProps[i] = props
		memberTypeIDs[i] = ids
	}

	for i, props := range memberProps {
		var picked *protocol.RunType
		pickedComplexity := 0
		for _, propNode := range props {
			childID := ""
			if propNode.Child != nil {
				childID = propNode.Child.ID
			}
			unique := true
			for j, otherIDs := range memberTypeIDs {
				if i == j {
					continue
				}
				if _, hit := otherIDs[childID]; hit {
					unique = false
					break
				}
			}
			if !unique {
				continue
			}
			complexity := len(childID)
			if picked == nil || complexity < pickedComplexity {
				picked = propNode
				pickedComplexity = complexity
			}
		}
		if picked != nil {
			picked.IsUnionDiscriminator = true
		}
	}
}
