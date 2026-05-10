// Package serialize projects tsgo's *checker.Type into a reflection-shape
// protocol.RunType graph. Every resolved type gets a structural id (mirroring
// mion's `_createTypeId`) which is hashed (mion's quickHash, ported in
// `internal/hashid`) into a short alphanumeric wire id. Two structurally-equal
// types share the same wire id — that's what makes our cache keys stable
// across builds and equivalent to what mion would compute at runtime.
//
// The serializer is stateful across calls: multiple resolver queries share
// one deduplicated type table and one hash dictionary. NOT safe for
// concurrent use.
package serialize

import (
	"fmt"
	"sort"
	"strconv"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-run-types/internal/hashid"
	"github.com/mionkit/ts-run-types/internal/protocol"
	"github.com/mionkit/ts-run-types/internal/typeid"
)

// Options configures the serializer's hash budget. Zero values use the
// hashid defaults (6 / 5 chars). Larger values reduce collision probability
// in big codebases at the cost of source-code size.
type Options struct {
	HashLength        int
	LiteralHashLength int
}

func (opts Options) hashLength() int {
	if opts.HashLength > 0 {
		return opts.HashLength
	}
	return hashid.DefaultLength
}

func (opts Options) literalHashLength() int {
	if opts.LiteralHashLength > 0 {
		return opts.LiteralHashLength
	}
	return hashid.DefaultLiteralLength
}

// Cache holds the interned type table.
type Cache struct {
	opts Options

	// Pointer cache: same *checker.Type seen twice → same wire id, no re-walk.
	byPtr map[*checker.Type]string

	// Structural cache: same structural id (regardless of pointer identity) →
	// same wire id. This is where structural dedup happens.
	byStructural map[string]string

	// Type table keyed by wire id. nodes[id] is the canonical entry.
	nodes map[string]*protocol.RunType

	// Insertion order so Dump() returns nodes deterministically (sorted by id
	// at dump time for cross-build determinism).
	insertOrder []string

	// fileTypeIDs records which wire ids were transitively reached from each
	// scanned file's call sites. Populated by the resolver (not by assignID
	// itself, so the cache stays resolution-agnostic). Cleared on Clear and
	// on Rebind — both wipe the per-file scope along with the type table /
	// pointer cache, matching the contract that reset / setSources start
	// "scanned files" from empty.
	fileTypeIDs map[string]map[string]struct{}

	dict        *hashid.Dict
	literals    *hashid.Dict
	typeChecker *checker.Checker
	idComputer  *typeid.Computer
}

// NewCache constructs an empty Cache bound to the supplied checker.
func NewCache(typeChecker *checker.Checker, opts Options) *Cache {
	return &Cache{
		opts:         opts,
		byPtr:        make(map[*checker.Type]string),
		byStructural: make(map[string]string),
		nodes:        make(map[string]*protocol.RunType),
		fileTypeIDs:  make(map[string]map[string]struct{}),
		dict:         hashid.New(),
		literals:     hashid.New(),
		typeChecker:  typeChecker,
		idComputer:   typeid.New(typeChecker),
	}
}

// Size returns the number of distinct types currently interned.
func (cache *Cache) Size() int { return len(cache.nodes) }

// Clear drops every interned type and resets the hash dictionaries. Used by
// the resolver when a `resetCache` op arrives, or implicitly when a fresh
// session is established. Safe to call concurrently with… nothing — the
// cache is not thread-safe (same constraint as the package as a whole).
func (cache *Cache) Clear() {
	cache.byPtr = make(map[*checker.Type]string)
	cache.byStructural = make(map[string]string)
	cache.nodes = make(map[string]*protocol.RunType)
	cache.insertOrder = cache.insertOrder[:0]
	cache.fileTypeIDs = make(map[string]map[string]struct{})
	cache.dict = hashid.New()
	cache.literals = hashid.New()
}

// Rebind points the cache at a new checker. Called after a Program swap so
// subsequent assignID calls compute structural ids against the live checker.
// The pointer cache (byPtr) is cleared because keys are *checker.Type from
// the old Program and can never match new lookups; structural dedup
// (byStructural + nodes) survives — same shape, same id across Programs.
//
// Passing nil unbinds — the cache becomes safe-to-hold but unusable until a
// subsequent Rebind installs a real checker. Used by resolver.ResetCache
// when wiping the Program back to the NewServer state.
func (cache *Cache) Rebind(typeChecker *checker.Checker) {
	cache.typeChecker = typeChecker
	if typeChecker != nil {
		cache.idComputer = typeid.New(typeChecker)
	} else {
		cache.idComputer = nil
	}
	cache.byPtr = make(map[*checker.Type]string)
	// Per-file scope is tied to the previous Program's source files; a
	// Program swap invalidates every key. Drop the map so the next
	// scanFiles starts from "no files scanned yet".
	cache.fileTypeIDs = make(map[string]map[string]struct{})
}

// Dump returns every interned Type sorted by wire id (deterministic across
// builds — given identical inputs, dump bytes are identical).
func (cache *Cache) Dump() []*protocol.RunType {
	ids := make([]string, 0, len(cache.nodes))
	for id := range cache.nodes {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := make([]*protocol.RunType, 0, len(ids))
	for _, id := range ids {
		out = append(out, cache.nodes[id])
	}
	return out
}

// Added returns the slice of nodes inserted since `before`. Used by the
// resolver to stream incremental updates back to clients.
func (cache *Cache) Added(before int) []*protocol.RunType {
	if before >= len(cache.insertOrder) {
		return nil
	}
	out := make([]*protocol.RunType, 0, len(cache.insertOrder)-before)
	for _, id := range cache.insertOrder[before:] {
		if node, ok := cache.nodes[id]; ok {
			out = append(out, node)
		}
	}
	return out
}

// Serialize projects tsType into the cache and returns a ref to the canonical
// entry. Callers receive a `KindRef` sentinel; the actual full Type lives in
// `cache.nodes[id]`.
func (cache *Cache) Serialize(tsType *checker.Type) *protocol.RunType {
	id := cache.assignID(tsType)
	return protocol.NewRef(id)
}

// AssignID projects tsType into the cache (if new) and returns its hash id.
// Public alias for the internal assignID used by callers — like the marker
// scanner — that only need an id, not a RunType sentinel.
func (cache *Cache) AssignID(tsType *checker.Type) string {
	return cache.assignID(tsType)
}

// SerializeRegexLiteral registers a synthetic regex-literal RunType entry and
// returns its hash id. Two calls with the same (source, flags) deduplicate.
//
// Bypasses the *checker.Type path entirely — TS has no regex-literal type, so
// the marker scanner harvests the regex from the AST when it can. The emitter
// dispatches on the `literal.regexp` shape (see emit/runtypes_module.go footerLiteralExpr)
// to render a `/source/flags` regex literal at runtime.
func (cache *Cache) SerializeRegexLiteral(source, flags string) string {
	structural := strconv.Itoa(int(protocol.KindLiteral)) + ":regexp:" + source + "|" + flags
	if id, ok := cache.byStructural[structural]; ok {
		return id
	}
	id, err := cache.literals.Unique(structural, cache.opts.literalHashLength())
	if err != nil {
		// Fallback id must stay identifier-safe (the JS emitter uses it
		// verbatim as a `const` name). The structural form contains `:` and
		// `|`, so we hash it instead of concatenating. Prefix matches the
		// other synthetic ids (`x_tm_`, `x_pr_`, …).
		id = "x_re_" + hashid.QuickHash(structural, cache.opts.literalHashLength(), "")
	}
	cache.byStructural[structural] = id
	cache.nodes[id] = &protocol.RunType{
		ID:   id,
		Kind: protocol.KindLiteral,
		Literal: map[string]any{
			"regexp": map[string]any{
				"source": source,
				"flags":  flags,
			},
		},
	}
	cache.insertOrder = append(cache.insertOrder, id)
	return id
}

// SerializeTopLevel returns the canonical RunType entry (not a ref). Used by
// the resolver to record the top of a query result so callers see the full
// shape rather than a sentinel.
func (cache *Cache) SerializeTopLevel(tsType *checker.Type) *protocol.RunType {
	id := cache.assignID(tsType)
	return cache.nodes[id]
}

// NodeByID returns the canonical full Type for id, or nil if no such id
// has been interned. Backs the OpResolveID query op for callers walking a
// member type's child KindRef slots.
func (cache *Cache) NodeByID(id string) *protocol.RunType {
	return cache.nodes[id]
}

// RecordFileID associates id with file in the per-file scope map. Called by
// the resolver after each scanFiles run to remember which run types a
// given file's call sites transitively reached. Used later by IDsForUnion
// to project a scanFiles response down to the request's specific files.
func (cache *Cache) RecordFileID(file, id string) {
	if file == "" || id == "" {
		return
	}
	bucket, ok := cache.fileTypeIDs[file]
	if !ok {
		bucket = make(map[string]struct{})
		cache.fileTypeIDs[file] = bucket
	}
	bucket[id] = struct{}{}
}

// IDsForUnion returns the deduplicated, sorted slice of wire ids reachable
// from any of files. The resolver passes the request's explicit Files
// list so the response is scoped to those files only — NOT to every file
// that's ever been scanned in this session. Ids missing from the type
// table are dropped silently (Clear / Rebind keep the two maps in sync).
func (cache *Cache) IDsForUnion(files []string) []string {
	if len(files) == 0 {
		return nil
	}
	seen := make(map[string]struct{})
	for _, file := range files {
		for id := range cache.fileTypeIDs[file] {
			if _, ok := cache.nodes[id]; !ok {
				continue
			}
			seen[id] = struct{}{}
		}
	}
	if len(seen) == 0 {
		return nil
	}
	out := make([]string, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// NodesForIDs returns the canonical *RunType entries for the given ids, in
// the order supplied. Ids missing from the table are skipped. Used by the
// resolver to materialise a "scanned files" scoped slice into a Dump.
func (cache *Cache) NodesForIDs(ids []string) []*protocol.RunType {
	if len(ids) == 0 {
		return nil
	}
	out := make([]*protocol.RunType, 0, len(ids))
	for _, id := range ids {
		if node := cache.nodes[id]; node != nil {
			out = append(out, node)
		}
	}
	return out
}

// assignID computes/looks-up the wire id for tsType, projecting it on first sight.
func (cache *Cache) assignID(tsType *checker.Type) string {
	if tsType == nil {
		return cache.internEmpty(protocol.KindUnknown, "nilType")
	}
	if id, ok := cache.byPtr[tsType]; ok {
		return id
	}

	structural := cache.idComputer.Compute(tsType)
	if id, ok := cache.byStructural[structural]; ok {
		cache.byPtr[tsType] = id
		return id
	}

	// Hash the structural id. Literal kinds use the shorter literal-budget.
	var id string
	var err error
	if isLiteralStructural(structural) {
		id, err = cache.literals.Unique(structural, cache.opts.literalHashLength())
	} else {
		id, err = cache.dict.Unique(structural, cache.opts.hashLength())
	}
	if err != nil {
		// Unrecoverable hash exhaustion — fall back to a hash of the
		// structural string. The structural form contains `:` separators,
		// so it can't be used verbatim as a JS const name.
		id = "x_" + hashid.QuickHash(structural, cache.opts.hashLength(), "")
	}

	cache.byPtr[tsType] = id
	cache.byStructural[structural] = id

	// Reserve the slot before projecting so cycles see the id.
	cache.nodes[id] = &protocol.RunType{ID: id, Kind: typeid.KindOf(cache.typeChecker, tsType)}
	cache.insertOrder = append(cache.insertOrder, id)

	node := cache.projectType(tsType, id)
	cache.nodes[id] = node
	return id
}

// internEmpty creates a placeholder entry for nil/unknown types so consumers
// always see *something* rather than a dangling ref.
func (cache *Cache) internEmpty(kind protocol.ReflectionKind, markerName string) string {
	structural := "_empty_" + markerName
	if id, ok := cache.byStructural[structural]; ok {
		return id
	}
	id, err := cache.dict.Unique(structural, cache.opts.hashLength())
	if err != nil {
		id = "x_" + markerName
	}
	cache.byStructural[structural] = id
	cache.nodes[id] = &protocol.RunType{ID: id, Kind: kind, Flags: []string{markerName}}
	cache.insertOrder = append(cache.insertOrder, id)
	return id
}

func isLiteralStructural(structural string) bool {
	// Per typeid.dispatch, literals start with the kind number followed by a colon.
	// The literal kind is `protocol.KindLiteral`. Encoded as "13:..." when we
	// renumber to ReflectionKind values. Use a byte check rather than parsing.
	return len(structural) > 3 && structural[0] == '1' && structural[1] == '3' && structural[2] == ':'
}

// ---------------------------------------------------------------------------
// projection — fills in a node's structural fields. The id is already set by
// assignID; we only populate kind-specific contents here.
// ---------------------------------------------------------------------------

func (cache *Cache) projectType(tsType *checker.Type, id string) *protocol.RunType {
	node := &protocol.RunType{ID: id}
	flags := tsType.Flags()

	// typeName from a user-declared type alias ("User" in `type User = {...}`).
	if alias := checker.Type_alias(tsType); alias != nil && alias.Symbol() != nil {
		node.TypeName = alias.Symbol().Name
		if typeArguments := alias.TypeArguments(); len(typeArguments) > 0 {
			node.TypeArguments = make([]*protocol.RunType, 0, len(typeArguments))
			for _, typeArgument := range typeArguments {
				node.TypeArguments = append(node.TypeArguments, cache.Serialize(typeArgument))
			}
		}
	}

	switch {
	case flags&checker.TypeFlagsAny != 0:
		node.Kind = protocol.KindAny

	case flags&checker.TypeFlagsUnknown != 0:
		node.Kind = protocol.KindUnknown

	case flags&checker.TypeFlagsNever != 0:
		node.Kind = protocol.KindNever

	case flags&checker.TypeFlagsVoid != 0:
		node.Kind = protocol.KindVoid

	case flags&checker.TypeFlagsUndefined != 0:
		node.Kind = protocol.KindUndefined

	case flags&checker.TypeFlagsNull != 0:
		node.Kind = protocol.KindNull

	case flags&checker.TypeFlagsStringLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = tsType.AsLiteralType().Value()

	case flags&checker.TypeFlagsNumberLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = parseNumberLiteral(cache.typeChecker.TypeToString(tsType))

	case flags&checker.TypeFlagsBooleanLiteral != 0:
		node.Kind = protocol.KindLiteral
		node.Literal = cache.typeChecker.TypeToString(tsType) == "true"

	case flags&checker.TypeFlagsBigIntLiteral != 0:
		node.Kind = protocol.KindLiteral
		// JSON numbers can't carry arbitrary-precision bigint — emit as a
		// decimal string + flag so the renderer wraps with `BigInt(...)`.
		node.Literal = fmt.Sprintf("%v", tsType.AsLiteralType().Value())
		node.Flags = append(node.Flags, "bigint")

	case flags&checker.TypeFlagsUniqueESSymbol != 0:
		node.Kind = protocol.KindLiteral
		name := ""
		if symbol := tsType.Symbol(); symbol != nil {
			name = symbol.Name
		}
		node.Literal = map[string]any{"symbol": name}
		node.Flags = append(node.Flags, "symbol")

	case flags&checker.TypeFlagsString != 0:
		node.Kind = protocol.KindString

	case flags&checker.TypeFlagsNumber != 0:
		node.Kind = protocol.KindNumber

	case flags&checker.TypeFlagsBoolean != 0:
		node.Kind = protocol.KindBoolean

	case flags&checker.TypeFlagsBigInt != 0:
		node.Kind = protocol.KindBigInt

	case flags&checker.TypeFlagsESSymbol != 0:
		node.Kind = protocol.KindSymbol

	case flags&checker.TypeFlagsEnum != 0 || flags&checker.TypeFlagsEnumLike != 0:
		cache.projectEnum(tsType, node)

	case flags&checker.TypeFlagsEnumLiteral != 0:
		// A reference to a single enum member used as a type. Emit the parent
		// enum and tag with the member name.
		cache.projectEnum(tsType, node)
		if symbol := tsType.Symbol(); symbol != nil {
			node.Flags = append(node.Flags, "enumMember:"+symbol.Name)
		}

	case flags&checker.TypeFlagsUnion != 0:
		node.Kind = protocol.KindUnion
		for _, member := range tsType.Distributed() {
			node.Children = append(node.Children, cache.Serialize(member))
		}

	case flags&checker.TypeFlagsIntersection != 0:
		node.Kind = protocol.KindIntersection
		for _, member := range tsType.AsUnionOrIntersectionType().Types() {
			node.Children = append(node.Children, cache.Serialize(member))
		}

	case flags&checker.TypeFlagsNonPrimitive != 0:
		// The bare `object` primitive (`const x: object`).
		node.Kind = protocol.KindObject

	case flags&checker.TypeFlagsObject != 0:
		cache.projectObjectType(tsType, node)

	default:
		node.Kind = protocol.KindUnknown
		node.TypeName = cache.typeChecker.TypeToString(tsType)
	}

	return node
}

// ---------------------------------------------------------------------------
// object-flavoured types: array / tuple / promise / function / class /
// objectLiteral / regexp / Date
// ---------------------------------------------------------------------------

func (cache *Cache) projectObjectType(tsType *checker.Type, node *protocol.RunType) {
	if checker.IsTupleType(tsType) {
		cache.projectTuple(tsType, node)
		return
	}

	if cache.typeChecker.IsArrayLikeType(tsType) {
		typeArguments := cache.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			node.Kind = protocol.KindArray
			node.Child = cache.Serialize(typeArguments[0])
			return
		}
	}

	if symbol := tsType.Symbol(); symbol != nil {
		switch symbol.Name {
		case "Promise":
			typeArguments := cache.typeChecker.GetTypeArguments(tsType)
			if len(typeArguments) > 0 {
				node.Kind = protocol.KindPromise
				node.Child = cache.Serialize(typeArguments[0])
				return
			}
		case "RegExp":
			node.Kind = protocol.KindRegexp
			node.ClassRef = &protocol.ClassRef{Builtin: "RegExp"}
			return
		case "Date", "Map", "Set":
			// tsgo declares these as interfaces in lib.d.ts (no
			// ObjectFlagsClass), but mion's runtypes treats them as classes
			// (they're dispatched through `initClassRunType`). Promote to
			// KindClass with the builtin marker so the footer wires up
			// `t.classType = globalThis.<Name>`.
			cache.projectClass(tsType, node)
			return
		}
	}

	if isClass(tsType) {
		cache.projectClass(tsType, node)
		return
	}

	cache.projectObjectLiteral(tsType, node)
}

func (cache *Cache) projectTuple(tsType *checker.Type, node *protocol.RunType) {
	node.Kind = protocol.KindTuple
	tupleType := tsType.TargetTupleType()
	elementInfos := tupleType.ElementInfos()
	typeArguments := cache.typeChecker.GetTypeArguments(tsType)
	for i, info := range elementInfos {
		var elementType *checker.Type
		if i < len(typeArguments) {
			elementType = typeArguments[i]
		}
		elementFlags := info.TupleElementFlags()
		// In tsgo, optional tuple slots type as `T | undefined`. The reflection
		// shape keeps the optional bit on the TupleMember and the inner type
		// stays `T` — strip undefined when the element is optional.
		if elementFlags&checker.ElementFlagsOptional != 0 && elementType != nil {
			elementType = stripUndefined(elementType)
		}
		position := i
		member := &protocol.RunType{
			Kind:     protocol.KindTupleMember,
			Child:    cache.Serialize(elementType),
			Position: &position,
		}
		if labelDecl := info.LabeledDeclaration(); labelDecl != nil {
			// labelDecl is the labeled Parameter / NamedTupleMember AST node.
			// Its .Text() is undefined on the wrapper kind itself; the label
			// lives on the inner binding name. Mirrors the tsgo checker at
			// internal/checker/relater.go:getTupleElementLabel.
			if nameNode := labelDecl.Name(); nameNode != nil {
				member.Name = nameNode.Text()
			}
		}
		if elementFlags&checker.ElementFlagsOptional != 0 {
			member.Optional = true
		}
		if elementFlags&checker.ElementFlagsRest != 0 {
			member.Flags = append(member.Flags, "rest")
		}
		if elementFlags&checker.ElementFlagsVariadic != 0 {
			member.Flags = append(member.Flags, "variadic")
		}
		// Anonymous tuple-member node — generate a unique id from its slot
		// index since two members with same payload at different positions
		// must not dedup.
		structural := fmt.Sprintf("_tm_%s_%d", node.ID, i)
		memberID, err := cache.dict.Unique(structural, cache.opts.hashLength())
		if err != nil {
			memberID = "x_tm_" + structural
		}
		member.ID = memberID
		cache.byStructural[structural] = memberID
		cache.nodes[memberID] = member
		cache.insertOrder = append(cache.insertOrder, memberID)
		node.Children = append(node.Children, protocol.NewRef(memberID))
	}
}

func (cache *Cache) projectObjectLiteral(tsType *checker.Type, node *protocol.RunType) {
	callSignatures := cache.typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)
	properties := cache.typeChecker.GetPropertiesOfType(tsType)
	if len(callSignatures) > 0 && len(properties) == 0 {
		node.Kind = protocol.KindFunction
		cache.projectSignatureInto(callSignatures[0], node)
		return
	}
	node.Kind = protocol.KindObjectLiteral
	cache.projectMembersInto(tsType, node, properties, callSignatures, false)
}

func (cache *Cache) projectClass(tsType *checker.Type, node *protocol.RunType) {
	node.Kind = protocol.KindClass
	if symbol := tsType.Symbol(); symbol != nil {
		node.TypeName = symbol.Name
		switch symbol.Name {
		case "Date", "Map", "Set", "RegExp":
			node.ClassRef = &protocol.ClassRef{Builtin: symbol.Name}
		default:
			node.ClassRef = &protocol.ClassRef{Name: symbol.Name}
		}
	}
	// GetTypeArguments only works on TypeReference targets; calling it on
	// a plain interface (like the lib.d.ts Date interface) panics. Guard
	// with the ObjectFlagsReference flag.
	if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		if typeArguments := cache.typeChecker.GetTypeArguments(tsType); len(typeArguments) > 0 {
			for _, typeArgument := range typeArguments {
				node.Arguments = append(node.Arguments, cache.Serialize(typeArgument))
			}
		}
	}
	properties := cache.typeChecker.GetPropertiesOfType(tsType)
	// Class static members live on the symbol's Exports table, not on the
	// instance type. Append them so static properties / methods reach the
	// same projection path (applyMemberModifiers reads the `static` keyword
	// off each declaration's modifier flags).
	if symbol := tsType.Symbol(); symbol != nil {
		properties = appendStaticMembers(properties, symbol)
	}
	cache.projectMembersInto(tsType, node, properties, nil, true)
}

// appendStaticMembers extends instanceProps with each static member symbol
// the class symbol carries in Exports. Skips internal names (constructor,
// prototype slot, etc.) which start with the InternalSymbolNamePrefix
// sentinel.
func appendStaticMembers(instanceProps []*ast.Symbol, classSymbol *ast.Symbol) []*ast.Symbol {
	if classSymbol.Exports == nil {
		return instanceProps
	}
	for name, exportSymbol := range classSymbol.Exports {
		if exportSymbol == nil {
			continue
		}
		if len(name) > 0 && name[0] == 0xFE {
			// InternalSymbolNamePrefix — skip @@call / @@constructor / @@new / etc.
			continue
		}
		// Filter to value-shape members (property / method / accessor).
		if exportSymbol.Flags&(ast.SymbolFlagsProperty|ast.SymbolFlagsMethod|ast.SymbolFlagsAccessor) == 0 {
			continue
		}
		instanceProps = append(instanceProps, exportSymbol)
	}
	return instanceProps
}

func (cache *Cache) projectMembersInto(
	tsType *checker.Type,
	node *protocol.RunType,
	properties []*ast.Symbol,
	callSignatures []*checker.Signature,
	asClass bool,
) {
	for i, propertySymbol := range properties {
		cache.appendProperty(node, propertySymbol, asClass, i)
	}
	for i, indexInfo := range cache.typeChecker.GetIndexInfosOfType(tsType) {
		indexNode := &protocol.RunType{
			Kind:  protocol.KindIndexSignature,
			Index: cache.Serialize(indexInfo.KeyType()),
			Child: cache.Serialize(indexInfo.ValueType()),
		}
		if indexInfo.IsReadonly() {
			indexNode.Readonly = true
		}
		structural := fmt.Sprintf("_idx_%s_%d", node.ID, i)
		indexID, err := cache.dict.Unique(structural, cache.opts.hashLength())
		if err != nil {
			indexID = "x_idx_" + structural
		}
		indexNode.ID = indexID
		cache.byStructural[structural] = indexID
		cache.nodes[indexID] = indexNode
		cache.insertOrder = append(cache.insertOrder, indexID)
		node.Children = append(node.Children, protocol.NewRef(indexID))
	}
	for i, signature := range callSignatures {
		callNode := &protocol.RunType{Kind: protocol.KindCallSignature}
		cache.projectSignatureInto(signature, callNode)
		structural := fmt.Sprintf("_cs_%s_%d", node.ID, i)
		callID, err := cache.dict.Unique(structural, cache.opts.hashLength())
		if err != nil {
			callID = "x_cs_" + structural
		}
		callNode.ID = callID
		cache.byStructural[structural] = callID
		cache.nodes[callID] = callNode
		cache.insertOrder = append(cache.insertOrder, callID)
		node.Children = append(node.Children, protocol.NewRef(callID))
	}
}

func (cache *Cache) appendProperty(parent *protocol.RunType, symbol *ast.Symbol, asClass bool, index int) {
	propertyType := cache.typeChecker.GetTypeOfSymbol(symbol)

	// Method-vs-property: a property whose type is a single-call-signature
	// function with no other members maps to the `method` / `methodSignature`
	// form.
	isMethod := false
	if propertyType != nil {
		signatures := cache.typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)
		if len(signatures) > 0 && len(cache.typeChecker.GetPropertiesOfType(propertyType)) == 0 {
			isMethod = true
		}
	}

	member := &protocol.RunType{Name: symbol.Name}
	if symbol.Flags&ast.SymbolFlagsOptional != 0 {
		member.Optional = true
	}
	member.IsSafePropName = isSafePropName(symbol.Name)
	applyMemberModifiers(member, symbol, asClass)

	if isMethod {
		if asClass {
			member.Kind = protocol.KindMethod
		} else {
			member.Kind = protocol.KindMethodSignature
		}
		signatures := cache.typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)
		cache.projectSignatureInto(signatures[0], member)
	} else {
		if asClass {
			member.Kind = protocol.KindProperty
		} else {
			member.Kind = protocol.KindPropertySignature
		}
		// Optional properties carry `T | undefined` at the symbol type
		// layer; the Optional flag IS the "undefined-permitted" signal so
		// the union wrapper is redundant. Strip it so circular optional
		// self-references close on the inner type, not on a wrapping
		// union node. Mirrors the tuple-member treatment at projectTuple.
		childType := propertyType
		if member.Optional {
			childType = stripUndefined(childType)
		}
		member.Child = cache.Serialize(childType)
	}

	structural := fmt.Sprintf("_pr_%s_%s_%d", parent.ID, symbol.Name, index)
	memberID, err := cache.dict.Unique(structural, cache.opts.hashLength())
	if err != nil {
		memberID = "x_pr_" + structural
	}
	member.ID = memberID
	cache.byStructural[structural] = memberID
	cache.nodes[memberID] = member
	cache.insertOrder = append(cache.insertOrder, memberID)
	parent.Children = append(parent.Children, protocol.NewRef(memberID))
}

func (cache *Cache) projectSignatureInto(signature *checker.Signature, node *protocol.RunType) {
	for i, paramSymbol := range signature.Parameters() {
		paramType := cache.typeChecker.GetTypeOfSymbol(paramSymbol)
		position := i
		parameter := &protocol.RunType{
			Kind:     protocol.KindParameter,
			Name:     paramSymbol.Name,
			Position: &position,
		}
		if paramSymbol.Flags&ast.SymbolFlagsOptional != 0 || isOptionalParameter(paramSymbol) {
			parameter.Optional = true
		}
		if isRestParameter(paramSymbol) {
			parameter.Flags = append(parameter.Flags, "rest")
		}
		// Optional parameters carry `T | undefined` at the symbol-type
		// layer; the Optional flag IS the "undefined-permitted" signal so
		// the union wrapper is redundant. Mirrors the equivalent stripping
		// in appendProperty and projectTuple.
		childType := paramType
		if parameter.Optional {
			childType = stripUndefined(childType)
		}
		parameter.Child = cache.Serialize(childType)
		applyParameterDefault(parameter, paramSymbol)
		structural := fmt.Sprintf("_pa_%s_%s_%d", node.ID, paramSymbol.Name, i)
		paramID, err := cache.dict.Unique(structural, cache.opts.hashLength())
		if err != nil {
			paramID = "x_pa_" + structural
		}
		parameter.ID = paramID
		cache.byStructural[structural] = paramID
		cache.nodes[paramID] = parameter
		cache.insertOrder = append(cache.insertOrder, paramID)
		node.Parameters = append(node.Parameters, protocol.NewRef(paramID))
	}
	node.Return = cache.Serialize(cache.typeChecker.GetReturnTypeOfSignature(signature))
}

// ---------------------------------------------------------------------------
// enums
// ---------------------------------------------------------------------------

func (cache *Cache) projectEnum(tsType *checker.Type, node *protocol.RunType) {
	node.Kind = protocol.KindEnum
	if symbol := tsType.Symbol(); symbol != nil {
		node.TypeName = symbol.Name
		// Walk member symbols and read their values.
		// For TypeFlagsEnum, the type is the enum container; its symbol's
		// Exports map members to symbols whose ValueDeclaration is the
		// EnumMember node carrying the literal value.
		members := enumMembers(tsType)
		if len(members) > 0 {
			node.Enum = make(map[string]any, len(members))
			node.Values = make([]any, 0, len(members))
			allString, allNumber := true, true
			for _, member := range members {
				node.Enum[member.name] = member.value
				node.Values = append(node.Values, member.value)
				if _, ok := member.value.(string); !ok {
					allString = false
				}
				if _, ok := member.value.(int64); !ok {
					if _, ok := member.value.(float64); !ok {
						allNumber = false
					}
				}
			}
			switch {
			case allString:
				node.IndexT = &protocol.RunType{Kind: protocol.KindString, ID: "_enumIdx_string"}
			case allNumber:
				node.IndexT = &protocol.RunType{Kind: protocol.KindNumber, ID: "_enumIdx_number"}
			default:
				node.IndexT = &protocol.RunType{Kind: protocol.KindUnion, ID: "_enumIdx_mixed"}
			}
		}
	}
}

type enumMember struct {
	name  string
	value any
}

func enumMembers(tsType *checker.Type) []enumMember {
	symbol := tsType.Symbol()
	if symbol == nil || symbol.Exports == nil {
		return nil
	}
	out := make([]enumMember, 0, len(symbol.Exports))
	for name, memberSymbol := range symbol.Exports {
		if memberSymbol == nil || memberSymbol.ValueDeclaration == nil {
			continue
		}
		value := readEnumMemberValue(memberSymbol)
		out = append(out, enumMember{name: name, value: value})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	return out
}

func readEnumMemberValue(symbol *ast.Symbol) any {
	declaration := symbol.ValueDeclaration
	if declaration == nil || declaration.Kind != ast.KindEnumMember {
		return nil
	}
	enumMemberNode := declaration.AsEnumMember()
	if enumMemberNode == nil || enumMemberNode.Initializer == nil {
		// No initializer — implicit numeric. Walking siblings to compute the
		// auto-incremented value is tsgo's job; we'd need its evaluator.
		// Mion's EnumRunType skips null/undefined entries so emitting nil is
		// safe for v1.
		return nil
	}
	initializer := enumMemberNode.Initializer
	switch initializer.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return initializer.Text()
	case ast.KindNumericLiteral:
		// Best effort — preserve the original textual form.
		return parseNumberLiteral(initializer.Text())
	case ast.KindTrueKeyword:
		return true
	case ast.KindFalseKeyword:
		return false
	}
	return nil
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func isClass(tsType *checker.Type) bool {
	flags := tsType.ObjectFlags()
	if flags&checker.ObjectFlagsClass != 0 {
		return true
	}
	if flags&checker.ObjectFlagsReference != 0 {
		if target := tsType.Target(); target != nil && target.ObjectFlags()&checker.ObjectFlagsClass != 0 {
			return true
		}
	}
	return false
}

func stripUndefined(tsType *checker.Type) *checker.Type {
	if tsType == nil || tsType.Flags()&checker.TypeFlagsUnion == 0 {
		return tsType
	}
	parts := tsType.Distributed()
	kept := make([]*checker.Type, 0, len(parts))
	for _, part := range parts {
		if part.Flags()&checker.TypeFlagsUndefined != 0 {
			continue
		}
		kept = append(kept, part)
	}
	if len(kept) == 1 {
		return kept[0]
	}
	return tsType
}

func parseNumberLiteral(text string) any {
	var asInt int64
	if _, err := fmt.Sscanf(text, "%d", &asInt); err == nil {
		if fmt.Sprintf("%d", asInt) == text {
			return asInt
		}
	}
	var asFloat float64
	if _, err := fmt.Sscanf(text, "%g", &asFloat); err == nil {
		return asFloat
	}
	return text
}
