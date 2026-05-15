// Package serialize projects tsgo's *checker.Type into a reflection-shape
// protocol.Type graph. Every resolved type gets a structural id (mirroring
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

func (o Options) hashLength() int {
	if o.HashLength > 0 {
		return o.HashLength
	}
	return hashid.DefaultLength
}

func (o Options) literalHashLength() int {
	if o.LiteralHashLength > 0 {
		return o.LiteralHashLength
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
	nodes map[string]*protocol.Type

	// Insertion order so Dump() returns nodes deterministically (sorted by id
	// at dump time for cross-build determinism).
	insertOrder []string

	dict     *hashid.Dict
	literals *hashid.Dict
	tc       *checker.Checker
	idc      *typeid.Computer
}

// NewCache constructs an empty Cache bound to the supplied checker.
func NewCache(tc *checker.Checker, opts Options) *Cache {
	return &Cache{
		opts:         opts,
		byPtr:        make(map[*checker.Type]string),
		byStructural: make(map[string]string),
		nodes:        make(map[string]*protocol.Type),
		dict:         hashid.New(),
		literals:     hashid.New(),
		tc:           tc,
		idc:          typeid.New(tc),
	}
}

// Size returns the number of distinct types currently interned.
func (c *Cache) Size() int { return len(c.nodes) }

// Clear drops every interned type and resets the hash dictionaries. Used by
// the resolver when a `resetCache` op arrives, or implicitly when a fresh
// session is established. Safe to call concurrently with… nothing — the
// cache is not thread-safe (same constraint as the package as a whole).
func (c *Cache) Clear() {
	c.byPtr = make(map[*checker.Type]string)
	c.byStructural = make(map[string]string)
	c.nodes = make(map[string]*protocol.Type)
	c.insertOrder = c.insertOrder[:0]
	c.dict = hashid.New()
	c.literals = hashid.New()
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
func (c *Cache) Rebind(tc *checker.Checker) {
	c.tc = tc
	if tc != nil {
		c.idc = typeid.New(tc)
	} else {
		c.idc = nil
	}
	c.byPtr = make(map[*checker.Type]string)
}

// Dump returns every interned Type sorted by wire id (deterministic across
// builds — given identical inputs, dump bytes are identical).
func (c *Cache) Dump() []*protocol.Type {
	ids := make([]string, 0, len(c.nodes))
	for id := range c.nodes {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := make([]*protocol.Type, 0, len(ids))
	for _, id := range ids {
		out = append(out, c.nodes[id])
	}
	return out
}

// Added returns the slice of nodes inserted since `before`. Used by the
// resolver to stream incremental updates back to clients.
func (c *Cache) Added(before int) []*protocol.Type {
	if before >= len(c.insertOrder) {
		return nil
	}
	out := make([]*protocol.Type, 0, len(c.insertOrder)-before)
	for _, id := range c.insertOrder[before:] {
		if n, ok := c.nodes[id]; ok {
			out = append(out, n)
		}
	}
	return out
}

// Serialize projects t into the cache and returns a ref to the canonical
// entry. Callers receive a `KindRef` sentinel; the actual full Type lives in
// `c.nodes[id]`.
func (c *Cache) Serialize(t *checker.Type) *protocol.Type {
	id := c.assignID(t)
	return protocol.NewRef(id)
}

// AssignID projects t into the cache (if new) and returns its hash id.
// Public alias for the internal assignID used by callers — like the marker
// scanner — that only need an id, not a Type sentinel.
func (c *Cache) AssignID(t *checker.Type) string {
	return c.assignID(t)
}

// SerializeTopLevel returns the canonical Type entry (not a ref). Used by
// the resolver to record the top of a query result so callers see the full
// shape rather than a sentinel.
func (c *Cache) SerializeTopLevel(t *checker.Type) *protocol.Type {
	id := c.assignID(t)
	return c.nodes[id]
}

// NodeByID returns the canonical full Type for id, or nil if no such id
// has been interned. Backs the OpResolveID query op for callers walking a
// member type's child KindRef slots.
func (c *Cache) NodeByID(id string) *protocol.Type {
	return c.nodes[id]
}

// assignID computes/looks-up the wire id for t, projecting it on first sight.
func (c *Cache) assignID(t *checker.Type) string {
	if t == nil {
		return c.internEmpty(protocol.KindUnknown, "nilType")
	}
	if id, ok := c.byPtr[t]; ok {
		return id
	}

	structural := c.idc.Compute(t)
	if id, ok := c.byStructural[structural]; ok {
		c.byPtr[t] = id
		return id
	}

	// Hash the structural id. Literal kinds use the shorter literal-budget.
	var id string
	var err error
	if isLiteralStructural(structural) {
		id, err = c.literals.Unique(structural, c.opts.literalHashLength())
	} else {
		id, err = c.dict.Unique(structural, c.opts.hashLength())
	}
	if err != nil {
		// Unrecoverable hash exhaustion — fall back to the structural
		// string verbatim so the caller at least sees a usable id.
		id = "x" + structural
	}

	c.byPtr[t] = id
	c.byStructural[structural] = id

	// Reserve the slot before projecting so cycles see the id.
	c.nodes[id] = &protocol.Type{ID: id, Kind: typeid.KindOf(c.tc, t)}
	c.insertOrder = append(c.insertOrder, id)

	node := c.projectType(t, id)
	c.nodes[id] = node
	return id
}

// internEmpty creates a placeholder entry for nil/unknown types so consumers
// always see *something* rather than a dangling ref.
func (c *Cache) internEmpty(kind protocol.ReflectionKind, marker string) string {
	structural := "_empty_" + marker
	if id, ok := c.byStructural[structural]; ok {
		return id
	}
	id, err := c.dict.Unique(structural, c.opts.hashLength())
	if err != nil {
		id = "x_" + marker
	}
	c.byStructural[structural] = id
	c.nodes[id] = &protocol.Type{ID: id, Kind: kind, Flags: []string{marker}}
	c.insertOrder = append(c.insertOrder, id)
	return id
}

func isLiteralStructural(s string) bool {
	// Per typeid.dispatch, literals start with the kind number followed by a colon.
	// The literal kind is `protocol.KindLiteral`. Encoded as "13:..." when we
	// renumber to ReflectionKind values. Use a byte check rather than parsing.
	return len(s) > 3 && s[0] == '1' && s[1] == '3' && s[2] == ':'
}

// ---------------------------------------------------------------------------
// projection — fills in a node's structural fields. The id is already set by
// assignID; we only populate kind-specific contents here.
// ---------------------------------------------------------------------------

func (c *Cache) projectType(t *checker.Type, id string) *protocol.Type {
	n := &protocol.Type{ID: id}
	flags := t.Flags()

	// typeName from a user-declared type alias ("User" in `type User = {...}`).
	if alias := checker.Type_alias(t); alias != nil && alias.Symbol() != nil {
		n.TypeName = alias.Symbol().Name
		if args := alias.TypeArguments(); len(args) > 0 {
			n.TypeArguments = make([]*protocol.Type, 0, len(args))
			for _, a := range args {
				n.TypeArguments = append(n.TypeArguments, c.Serialize(a))
			}
		}
	}

	switch {
	case flags&checker.TypeFlagsAny != 0:
		n.Kind = protocol.KindAny

	case flags&checker.TypeFlagsUnknown != 0:
		n.Kind = protocol.KindUnknown

	case flags&checker.TypeFlagsNever != 0:
		n.Kind = protocol.KindNever

	case flags&checker.TypeFlagsVoid != 0:
		n.Kind = protocol.KindVoid

	case flags&checker.TypeFlagsUndefined != 0:
		n.Kind = protocol.KindUndefined

	case flags&checker.TypeFlagsNull != 0:
		n.Kind = protocol.KindNull

	case flags&checker.TypeFlagsStringLiteral != 0:
		n.Kind = protocol.KindLiteral
		n.Literal = t.AsLiteralType().Value()

	case flags&checker.TypeFlagsNumberLiteral != 0:
		n.Kind = protocol.KindLiteral
		n.Literal = parseNumberLiteral(c.tc.TypeToString(t))

	case flags&checker.TypeFlagsBooleanLiteral != 0:
		n.Kind = protocol.KindLiteral
		n.Literal = c.tc.TypeToString(t) == "true"

	case flags&checker.TypeFlagsBigIntLiteral != 0:
		n.Kind = protocol.KindLiteral
		// JSON numbers can't carry arbitrary-precision bigint — emit as a
		// decimal string + flag so the renderer wraps with `BigInt(...)`.
		n.Literal = fmt.Sprintf("%v", t.AsLiteralType().Value())
		n.Flags = append(n.Flags, "bigint")

	case flags&checker.TypeFlagsUniqueESSymbol != 0:
		n.Kind = protocol.KindLiteral
		name := ""
		if sym := t.Symbol(); sym != nil {
			name = sym.Name
		}
		n.Literal = map[string]any{"symbol": name}
		n.Flags = append(n.Flags, "symbol")

	case flags&checker.TypeFlagsString != 0:
		n.Kind = protocol.KindString

	case flags&checker.TypeFlagsNumber != 0:
		n.Kind = protocol.KindNumber

	case flags&checker.TypeFlagsBoolean != 0:
		n.Kind = protocol.KindBoolean

	case flags&checker.TypeFlagsBigInt != 0:
		n.Kind = protocol.KindBigInt

	case flags&checker.TypeFlagsESSymbol != 0:
		n.Kind = protocol.KindSymbol

	case flags&checker.TypeFlagsEnum != 0 || flags&checker.TypeFlagsEnumLike != 0:
		c.projectEnum(t, n)

	case flags&checker.TypeFlagsEnumLiteral != 0:
		// A reference to a single enum member used as a type. Emit the parent
		// enum and tag with the member name.
		c.projectEnum(t, n)
		if sym := t.Symbol(); sym != nil {
			n.Flags = append(n.Flags, "enumMember:"+sym.Name)
		}

	case flags&checker.TypeFlagsUnion != 0:
		n.Kind = protocol.KindUnion
		for _, m := range t.Distributed() {
			n.Types = append(n.Types, c.Serialize(m))
		}

	case flags&checker.TypeFlagsIntersection != 0:
		n.Kind = protocol.KindIntersection
		for _, m := range t.AsUnionOrIntersectionType().Types() {
			n.Types = append(n.Types, c.Serialize(m))
		}

	case flags&checker.TypeFlagsNonPrimitive != 0:
		// The bare `object` primitive (`const x: object`).
		n.Kind = protocol.KindObject

	case flags&checker.TypeFlagsObject != 0:
		c.projectObjectType(t, n)

	default:
		n.Kind = protocol.KindUnknown
		n.TypeName = c.tc.TypeToString(t)
	}

	return n
}

// ---------------------------------------------------------------------------
// object-flavoured types: array / tuple / promise / function / class /
// objectLiteral / regexp / Date
// ---------------------------------------------------------------------------

func (c *Cache) projectObjectType(t *checker.Type, n *protocol.Type) {
	if checker.IsTupleType(t) {
		c.projectTuple(t, n)
		return
	}

	if c.tc.IsArrayLikeType(t) {
		args := c.tc.GetTypeArguments(t)
		if len(args) > 0 {
			n.Kind = protocol.KindArray
			n.Type = c.Serialize(args[0])
			return
		}
	}

	if sym := t.Symbol(); sym != nil {
		switch sym.Name {
		case "Promise":
			args := c.tc.GetTypeArguments(t)
			if len(args) > 0 {
				n.Kind = protocol.KindPromise
				n.Type = c.Serialize(args[0])
				return
			}
		case "RegExp":
			n.Kind = protocol.KindRegexp
			n.ClassRef = &protocol.ClassRef{Builtin: "RegExp"}
			return
		case "Date", "Map", "Set":
			// tsgo declares these as interfaces in lib.d.ts (no
			// ObjectFlagsClass), but mion's runtypes treats them as classes
			// (they're dispatched through `initClassRunType`). Promote to
			// KindClass with the builtin marker so the footer wires up
			// `t.classType = globalThis.<Name>`.
			c.projectClass(t, n)
			return
		}
	}

	if isClass(t) {
		c.projectClass(t, n)
		return
	}

	c.projectObjectLiteral(t, n)
}

func (c *Cache) projectTuple(t *checker.Type, n *protocol.Type) {
	n.Kind = protocol.KindTuple
	tt := t.TargetTupleType()
	infos := tt.ElementInfos()
	args := c.tc.GetTypeArguments(t)
	for i, info := range infos {
		var elemType *checker.Type
		if i < len(args) {
			elemType = args[i]
		}
		flags := info.TupleElementFlags()
		// In tsgo, optional tuple slots type as `T | undefined`. The reflection
		// shape keeps the optional bit on the TupleMember and the inner type
		// stays `T` — strip undefined when the element is optional.
		if flags&checker.ElementFlagsOptional != 0 && elemType != nil {
			elemType = stripUndefined(elemType)
		}
		member := &protocol.Type{
			Kind: protocol.KindTupleMember,
			Type: c.Serialize(elemType),
		}
		if name := info.LabeledDeclaration(); name != nil {
			member.Name = name.Text()
		}
		if flags&checker.ElementFlagsOptional != 0 {
			member.Optional = true
		}
		if flags&checker.ElementFlagsRest != 0 {
			member.Flags = append(member.Flags, "rest")
		}
		if flags&checker.ElementFlagsVariadic != 0 {
			member.Flags = append(member.Flags, "variadic")
		}
		// Anonymous tuple-member node — generate a unique id from its slot
		// index since two members with same payload at different positions
		// must not dedup.
		structural := fmt.Sprintf("_tm_%s_%d", n.ID, i)
		mid, err := c.dict.Unique(structural, c.opts.hashLength())
		if err != nil {
			mid = "x_tm_" + structural
		}
		member.ID = mid
		c.byStructural[structural] = mid
		c.nodes[mid] = member
		c.insertOrder = append(c.insertOrder, mid)
		n.Types = append(n.Types, protocol.NewRef(mid))
	}
}

func (c *Cache) projectObjectLiteral(t *checker.Type, n *protocol.Type) {
	callSigs := c.tc.GetSignaturesOfType(t, checker.SignatureKindCall)
	props := c.tc.GetPropertiesOfType(t)
	if len(callSigs) > 0 && len(props) == 0 {
		n.Kind = protocol.KindFunction
		c.projectSignatureInto(callSigs[0], n)
		return
	}
	n.Kind = protocol.KindObjectLiteral
	c.projectMembersInto(t, n, props, callSigs, false)
}

func (c *Cache) projectClass(t *checker.Type, n *protocol.Type) {
	n.Kind = protocol.KindClass
	if sym := t.Symbol(); sym != nil {
		n.TypeName = sym.Name
		switch sym.Name {
		case "Date", "Map", "Set", "RegExp":
			n.ClassRef = &protocol.ClassRef{Builtin: sym.Name}
		default:
			n.ClassRef = &protocol.ClassRef{Name: sym.Name}
		}
	}
	// GetTypeArguments only works on TypeReference targets; calling it on
	// a plain interface (like the lib.d.ts Date interface) panics. Guard
	// with the ObjectFlagsReference flag.
	if t.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		if args := c.tc.GetTypeArguments(t); len(args) > 0 {
			for _, a := range args {
				n.Arguments = append(n.Arguments, c.Serialize(a))
			}
		}
	}
	props := c.tc.GetPropertiesOfType(t)
	c.projectMembersInto(t, n, props, nil, true)
}

func (c *Cache) projectMembersInto(
	t *checker.Type,
	n *protocol.Type,
	props []*ast.Symbol,
	callSigs []*checker.Signature,
	asClass bool,
) {
	for i, sym := range props {
		c.appendProperty(n, sym, asClass, i)
	}
	for i, info := range c.tc.GetIndexInfosOfType(t) {
		idx := &protocol.Type{
			Kind:  protocol.KindIndexSignature,
			Index: c.Serialize(info.KeyType()),
			Type:  c.Serialize(info.ValueType()),
		}
		if info.IsReadonly() {
			idx.Readonly = true
		}
		structural := fmt.Sprintf("_idx_%s_%d", n.ID, i)
		idxID, err := c.dict.Unique(structural, c.opts.hashLength())
		if err != nil {
			idxID = "x_idx_" + structural
		}
		idx.ID = idxID
		c.byStructural[structural] = idxID
		c.nodes[idxID] = idx
		c.insertOrder = append(c.insertOrder, idxID)
		n.Types = append(n.Types, protocol.NewRef(idxID))
	}
	for i, sig := range callSigs {
		callNode := &protocol.Type{Kind: protocol.KindCallSignature}
		c.projectSignatureInto(sig, callNode)
		structural := fmt.Sprintf("_cs_%s_%d", n.ID, i)
		callID, err := c.dict.Unique(structural, c.opts.hashLength())
		if err != nil {
			callID = "x_cs_" + structural
		}
		callNode.ID = callID
		c.byStructural[structural] = callID
		c.nodes[callID] = callNode
		c.insertOrder = append(c.insertOrder, callID)
		n.Types = append(n.Types, protocol.NewRef(callID))
	}
}

func (c *Cache) appendProperty(parent *protocol.Type, sym *ast.Symbol, asClass bool, idx int) {
	propType := c.tc.GetTypeOfSymbol(sym)

	// Method-vs-property: a property whose type is a single-call-signature
	// function with no other members maps to the `method` / `methodSignature`
	// form.
	isMethod := false
	if propType != nil {
		sigs := c.tc.GetSignaturesOfType(propType, checker.SignatureKindCall)
		if len(sigs) > 0 && len(c.tc.GetPropertiesOfType(propType)) == 0 {
			isMethod = true
		}
	}

	member := &protocol.Type{Name: sym.Name}
	if sym.Flags&ast.SymbolFlagsOptional != 0 {
		member.Optional = true
	}

	if isMethod {
		if asClass {
			member.Kind = protocol.KindMethod
		} else {
			member.Kind = protocol.KindMethodSignature
		}
		sigs := c.tc.GetSignaturesOfType(propType, checker.SignatureKindCall)
		c.projectSignatureInto(sigs[0], member)
	} else {
		if asClass {
			member.Kind = protocol.KindProperty
		} else {
			member.Kind = protocol.KindPropertySignature
		}
		member.Type = c.Serialize(propType)
	}

	structural := fmt.Sprintf("_pr_%s_%s_%d", parent.ID, sym.Name, idx)
	mid, err := c.dict.Unique(structural, c.opts.hashLength())
	if err != nil {
		mid = "x_pr_" + structural
	}
	member.ID = mid
	c.byStructural[structural] = mid
	c.nodes[mid] = member
	c.insertOrder = append(c.insertOrder, mid)
	parent.Types = append(parent.Types, protocol.NewRef(mid))
}

func (c *Cache) projectSignatureInto(sig *checker.Signature, n *protocol.Type) {
	for i, p := range sig.Parameters() {
		paramType := c.tc.GetTypeOfSymbol(p)
		param := &protocol.Type{
			Kind: protocol.KindParameter,
			Name: p.Name,
			Type: c.Serialize(paramType),
		}
		if p.Flags&ast.SymbolFlagsOptional != 0 {
			param.Optional = true
		}
		structural := fmt.Sprintf("_pa_%s_%s_%d", n.ID, p.Name, i)
		pid, err := c.dict.Unique(structural, c.opts.hashLength())
		if err != nil {
			pid = "x_pa_" + structural
		}
		param.ID = pid
		c.byStructural[structural] = pid
		c.nodes[pid] = param
		c.insertOrder = append(c.insertOrder, pid)
		n.Parameters = append(n.Parameters, protocol.NewRef(pid))
	}
	n.Return = c.Serialize(c.tc.GetReturnTypeOfSignature(sig))
}

// ---------------------------------------------------------------------------
// enums
// ---------------------------------------------------------------------------

func (c *Cache) projectEnum(t *checker.Type, n *protocol.Type) {
	n.Kind = protocol.KindEnum
	if sym := t.Symbol(); sym != nil {
		n.TypeName = sym.Name
		// Walk member symbols and read their values.
		// For TypeFlagsEnum, the type is the enum container; its symbol's
		// Exports map members to symbols whose ValueDeclaration is the
		// EnumMember node carrying the literal value.
		members := enumMembers(t)
		if len(members) > 0 {
			n.Enum = make(map[string]any, len(members))
			n.Values = make([]any, 0, len(members))
			allString, allNumber := true, true
			for _, m := range members {
				n.Enum[m.name] = m.value
				n.Values = append(n.Values, m.value)
				if _, ok := m.value.(string); !ok {
					allString = false
				}
				if _, ok := m.value.(int64); !ok {
					if _, ok := m.value.(float64); !ok {
						allNumber = false
					}
				}
			}
			switch {
			case allString:
				n.IndexT = &protocol.Type{Kind: protocol.KindString, ID: "_enumIdx_string"}
			case allNumber:
				n.IndexT = &protocol.Type{Kind: protocol.KindNumber, ID: "_enumIdx_number"}
			default:
				n.IndexT = &protocol.Type{Kind: protocol.KindUnion, ID: "_enumIdx_mixed"}
			}
		}
	}
}

type enumMember struct {
	name  string
	value any
}

func enumMembers(t *checker.Type) []enumMember {
	sym := t.Symbol()
	if sym == nil || sym.Exports == nil {
		return nil
	}
	out := make([]enumMember, 0, len(sym.Exports))
	for name, mem := range sym.Exports {
		if mem == nil || mem.ValueDeclaration == nil {
			continue
		}
		val := readEnumMemberValue(mem)
		out = append(out, enumMember{name: name, value: val})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].name < out[j].name })
	return out
}

func readEnumMemberValue(sym *ast.Symbol) any {
	decl := sym.ValueDeclaration
	if decl == nil || decl.Kind != ast.KindEnumMember {
		return nil
	}
	em := decl.AsEnumMember()
	if em == nil || em.Initializer == nil {
		// No initializer — implicit numeric. Walking siblings to compute the
		// auto-incremented value is tsgo's job; we'd need its evaluator.
		// Mion's EnumRunType skips null/undefined entries so emitting nil is
		// safe for v1.
		return nil
	}
	init := em.Initializer
	switch init.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return init.Text()
	case ast.KindNumericLiteral:
		// Best effort — preserve the original textual form.
		return parseNumberLiteral(init.Text())
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

func isClass(t *checker.Type) bool {
	flags := t.ObjectFlags()
	if flags&checker.ObjectFlagsClass != 0 {
		return true
	}
	if flags&checker.ObjectFlagsReference != 0 {
		if target := t.Target(); target != nil && target.ObjectFlags()&checker.ObjectFlagsClass != 0 {
			return true
		}
	}
	return false
}

func stripUndefined(t *checker.Type) *checker.Type {
	if t == nil || t.Flags()&checker.TypeFlagsUnion == 0 {
		return t
	}
	parts := t.Distributed()
	kept := make([]*checker.Type, 0, len(parts))
	for _, p := range parts {
		if p.Flags()&checker.TypeFlagsUndefined != 0 {
			continue
		}
		kept = append(kept, p)
	}
	if len(kept) == 1 {
		return kept[0]
	}
	return t
}

func parseNumberLiteral(s string) any {
	var i int64
	if _, err := fmt.Sscanf(s, "%d", &i); err == nil {
		if fmt.Sprintf("%d", i) == s {
			return i
		}
	}
	var f float64
	if _, err := fmt.Sscanf(s, "%g", &f); err == nil {
		return f
	}
	return s
}
