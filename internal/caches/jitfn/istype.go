package jitfn

import (
	"fmt"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// IsTypeEmitter implements the `isType` jit function — produces a
// boolean validator per RunType. The factory shape it emits:
//
//	export function get_isType_<hash>(utl){
//	  'use strict';
//	  return function isType_<hash>(v){ <body> }
//	}
//
// One file owns every isType-specific concern: the args list, the
// per-kind switch in Emit, the noop detection in Finalize, and the
// per-emitter "is this kind supported yet?" predicate in Supports.
// Adding a new mion fn (typeErrors, prepareForJson, …) means one new
// file of this same shape — the Walker in walker.go stays untouched.
type IsTypeEmitter struct{}

// Args returns the single `v` parameter the inner isType function
// takes. Mirrors mion's `jitArgs.vλl = 'v'` + empty default in
// run-types/src/constants.functions.ts:45.
func (IsTypeEmitter) Args() []ArgSpec {
	return []ArgSpec{{Key: "vλl", Name: "v", Default: ""}}
}

// Supports gates the renderer's top-level loop. Covers every atomic
// kind whose mion node ships an emitIsType, plus KindClass restricted
// to the Date subkind (mion's nodes/atomic/date.ts treats Date as
// atomic even though deepkit encodes it as a class).
//
// KindEnumMember is intentionally excluded: mion's enumMember.ts
// throws "Enum member operations are not supported" from emitIsType,
// so we never emit a factory for it. KindTemplateLiteral lives under
// nodes/collection/ in mion and is out of scope for the atomic port.
//
// Keep this set in lockstep with the `switch` in Emit — drift would
// silently emit broken JS (renderer thinks it's supported, Emit
// panics) or skip a valid kind.
func (IsTypeEmitter) Supports(rt *protocol.RunType) bool {
	if rt == nil {
		return false
	}
	switch rt.Kind {
	case protocol.KindAny, protocol.KindUnknown,
		protocol.KindNever, protocol.KindVoid,
		protocol.KindNull, protocol.KindUndefined,
		protocol.KindString, protocol.KindNumber, protocol.KindBoolean,
		protocol.KindBigInt, protocol.KindSymbol,
		protocol.KindObject, protocol.KindRegexp,
		protocol.KindLiteral, protocol.KindEnum:
		return true
	case protocol.KindClass:
		return rt.SubKind == protocol.SubKindDate
	}
	return false
}

// AnyIsTypeSupported reports whether at least one of `runTypes` is
// supported by the IsType emitter. Used by the resolver to set the
// AddedIsType wire signal independently of AddedRunTypes — a runtype
// can be added without the isType cache changing (unsupported kind).
func AnyIsTypeSupported(runTypes []*protocol.RunType) bool {
	emitter := IsTypeEmitter{}
	for _, rt := range runTypes {
		if emitter.Supports(rt) {
			return true
		}
	}
	return false
}

// IsJitInlined delegates to DefaultIsJitInlined. Mion's
// run-types/src/lib/baseRunTypes.ts:52 defines the predicate ONCE
// for every jit fn (no per-class overrides exist in the upstream
// runtype package), so the isType emitter inherits the shared
// behaviour: arrays and named collections become dependency calls,
// everything else inlines. Override here only if a concrete need
// surfaces — there isn't one today.
func (IsTypeEmitter) IsJitInlined(ctx *InlineContext) bool {
	return DefaultIsJitInlined(ctx)
}

// Emit is the single big switch over ReflectionKind. Each arm mirrors
// the body of the corresponding mion `emitIsType` method under
// mion-run-types:packages/run-types/src/nodes/atomic/<name>.ts —
// same pattern mion uses for stringifyJson in
// jitCompilers/json/stringifyJson.ts:37.
//
// Single-quoted JS string literals throughout to keep the JSON envelope's
// escape budget small (same rationale as the original KindString arm
// at line 95 and internal/emit/runtypes_module.go:quoteJS).
//
// Kinds NOT supported by IsTypeEmitter.Supports must not reach this
// switch from the renderer's top-level loop, but a parent emitter
// recursing into a child can still hit an unsupported kind — the
// final panic surfaces that as a compile-time-loud failure (per the
// "child kinds the dispatch doesn't handle should panic loudly"
// contract in emitter.go).
func (IsTypeEmitter) Emit(rt *protocol.RunType, ctx *EmitContext, _ CodeType) JitCode {
	if rt == nil {
		return JitCode{Code: "", Type: CodeE}
	}
	v := ctx.Vλl
	switch rt.Kind {
	case protocol.KindString:
		// mion:nodes/atomic/string.ts:14
		return JitCode{Code: "typeof " + v + " === 'string'", Type: CodeE}

	case protocol.KindNumber:
		// mion:nodes/atomic/number.ts:14. `Number.isFinite` rejects
		// Infinity / -Infinity / NaN and non-numbers without coercion —
		// this encodes the bug-flavor case from number.spec.ts.
		return JitCode{Code: "Number.isFinite(" + v + ")", Type: CodeE}

	case protocol.KindBoolean:
		// mion:nodes/atomic/boolean.ts:14
		return JitCode{Code: "typeof " + v + " === 'boolean'", Type: CodeE}

	case protocol.KindBigInt:
		// mion:nodes/atomic/bigInt.ts:14. Infinity / -Infinity rejection
		// from bigInt.spec.ts falls out of `typeof` automatically.
		return JitCode{Code: "typeof " + v + " === 'bigint'", Type: CodeE}

	case protocol.KindSymbol:
		// mion:nodes/atomic/symbol.ts:18
		return JitCode{Code: "typeof " + v + " === 'symbol'", Type: CodeE}

	case protocol.KindNull:
		// mion:nodes/atomic/null.ts:14
		return JitCode{Code: v + " === null", Type: CodeE}

	case protocol.KindUndefined:
		// mion:nodes/atomic/undefined.ts:14. Note `typeof === 'undefined'`
		// is used here while void uses `=== undefined` directly —
		// different emit text, same accepted value set.
		return JitCode{Code: "typeof " + v + " === 'undefined'", Type: CodeE}

	case protocol.KindVoid:
		// mion:nodes/atomic/void.ts:14. void accepts only undefined;
		// null is explicitly rejected (void.spec.ts).
		return JitCode{Code: v + " === undefined", Type: CodeE}

	case protocol.KindAny, protocol.KindUnknown:
		// mion:nodes/atomic/any.ts:13-15 (UnknownRunType extends AnyRunType).
		// At root nest level mion emits `undefined` (empty body); we emit
		// `true` and rely on Finalize to collapse the body to a noop. The
		// renderer then skips the factory entirely and consumers fall back
		// to a trivial `() => true`. Functionally equivalent.
		return JitCode{Code: "true", Type: CodeE}

	case protocol.KindNever:
		// mion:nodes/atomic/never.ts:13
		return JitCode{Code: "false", Type: CodeE}

	case protocol.KindObject:
		// mion:nodes/atomic/object.ts:13. Explicit null rejection despite
		// JS `typeof null === 'object'` — bug-flavor case from object.spec.ts.
		return JitCode{Code: "(typeof " + v + " === 'object' && " + v + " !== null)", Type: CodeE}

	case protocol.KindRegexp:
		// mion:nodes/atomic/regexp.ts:13
		return JitCode{Code: "(" + v + " instanceof RegExp)", Type: CodeE}

	case protocol.KindClass:
		if rt.SubKind == protocol.SubKindDate {
			// mion:nodes/atomic/date.ts:13. Rejects Invalid Date
			// (`new Date('xx')` whose getTime() is NaN).
			return JitCode{
				Code: "(" + v + " instanceof Date && !isNaN(" + v + ".getTime()))",
				Type: CodeE,
			}
		}
		panic(fmt.Sprintf("jitfn: isType emitter not implemented for KindClass subKind %d", rt.SubKind))

	case protocol.KindEnum:
		// mion:nodes/atomic/enum.ts:14. Chain of `=== <value>` over
		// rt.Values — mixed enums carry mixed value types (numeric
		// reverse-mapped + string-enum values) so each entry is
		// formatted via jsLiteralFromAny.
		if len(rt.Values) == 0 {
			return JitCode{Code: "false", Type: CodeE}
		}
		parts := make([]string, 0, len(rt.Values))
		for _, item := range rt.Values {
			lit, err := jsLiteralFromAny(item)
			if err != nil {
				panic(fmt.Sprintf("jitfn: isType emit for KindEnum: %v", err))
			}
			parts = append(parts, v+" === "+lit)
		}
		return JitCode{Code: "(" + strings.Join(parts, " || ") + ")", Type: CodeE}

	case protocol.KindLiteral:
		// mion:nodes/atomic/literal.ts:70-71 (emitIsType) +
		// literal.ts:88-105 (compileIsLiteral).
		return emitLiteral(rt, v)
	}
	panic(fmt.Sprintf("jitfn: isType emitter not implemented for kind %d (TODO)", rt.Kind))
}

// emitLiteral mirrors mion's compileIsLiteral (literal.ts:88-105).
// Branches on the runtime shape of rt.Literal as encoded by the Go-side
// serializer (see internal/caches/runtype/serialize.go:402-428):
//
//   - Flags=["bigint"], Literal=decimal string         → `v === 123n`
//   - Flags=["symbol"], Literal={"symbol": "name"}     → typeof + .description
//   - Literal={"regexp": {"source","flags"}}           → instanceof + source/flags
//   - Literal: bool / int64 / float64 / string         → `v === <literal>`
//
// The regex form compares `.source` and `.flags` directly rather than
// String(v) === String(<regex literal>) (mion's exact phrasing), to
// avoid embedding a regex source literal in emitted JS. Same
// observable semantics — including the escaped-regex spec case
// /['"]\/ \\ \// which only differs in source-text, not in the
// compared .source/.flags strings.
func emitLiteral(rt *protocol.RunType, v string) JitCode {
	flagSet := make(map[string]bool, len(rt.Flags))
	for _, flag := range rt.Flags {
		flagSet[flag] = true
	}
	literal := rt.Literal

	if flagSet["bigint"] {
		decimal, ok := literal.(string)
		if !ok {
			panic(fmt.Sprintf("jitfn: bigint literal expected decimal string, got %T", literal))
		}
		return JitCode{Code: v + " === " + decimal + "n", Type: CodeE}
	}

	if flagSet["symbol"] {
		// mion:literal.ts:103 — `typeof v === 'symbol' && v.description === <name>`
		entry, ok := literal.(map[string]any)
		if !ok {
			panic(fmt.Sprintf("jitfn: symbol literal expected map encoding, got %T", literal))
		}
		name, _ := entry["symbol"].(string)
		return JitCode{
			Code: "typeof " + v + " === 'symbol' && " + v + ".description === " + quoteJS(name),
			Type: CodeE,
		}
	}

	if entry, isMap := literal.(map[string]any); isMap {
		if regexpEntry, isRegexp := entry["regexp"].(map[string]any); isRegexp {
			// mion:literal.ts:90
			source, _ := regexpEntry["source"].(string)
			regFlags, _ := regexpEntry["flags"].(string)
			return JitCode{
				Code: v + " instanceof RegExp && " + v + ".source === " + quoteJS(source) +
					" && " + v + ".flags === " + quoteJS(regFlags),
				Type: CodeE,
			}
		}
	}

	lit, err := jsLiteralFromAny(literal)
	if err != nil {
		panic(fmt.Sprintf("jitfn: isType literal emit: %v", err))
	}
	return JitCode{Code: v + " === " + lit, Type: CodeE}
}

// jsLiteralFromAny mirrors the primitive subset of mion's
// run-types/src/lib/utils.ts toLiteral. BigInt / symbol / regexp
// literals are handled on their own paths in emitLiteral because
// their Go encoding carries extra envelope data (Flags markers or
// map shapes). Used by both KindLiteral and KindEnum.
func jsLiteralFromAny(value any) (string, error) {
	switch lit := value.(type) {
	case nil:
		return "null", nil
	case bool:
		if lit {
			return "true", nil
		}
		return "false", nil
	case int:
		return fmt.Sprintf("%d", lit), nil
	case int64:
		return fmt.Sprintf("%d", lit), nil
	case float64:
		// Go's %v drops the ".0" suffix on whole-number floats, matching
		// the JSON Number → JS Number round-trip mion gets via stringify.
		return fmt.Sprintf("%v", lit), nil
	case string:
		return quoteJS(lit), nil
	}
	return "", fmt.Errorf("jsLiteralFromAny: unsupported value type %T", value)
}

// Finalize matches mion's per-fn noop detection in
// handleFunctionReturn (jitFnCompiler.ts:420–423 for the isType case).
// An isType body that's empty, the bare expression `true`, or already
// `return true` is replaced by `return true` and marked noop so the
// renderer can skip emitting a factory whose validator always
// returns true (consumer can default to `() => true` for free).
func (IsTypeEmitter) Finalize(raw string) (string, bool) {
	code := normaliseWhitespace(raw)
	if code == "" || code == "true" || code == "return true" {
		return "return true", true
	}
	return code, false
}
