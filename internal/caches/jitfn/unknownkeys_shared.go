package jitfn

import (
	"sort"
	"strings"

	"github.com/mionkit/ts-run-types/internal/protocol"
)

// unknownKeysPureFnFilePath is the source path the resolver expects for
// the cpf_getUnknownKeysFromArray / cpf_hasUnknownKeysFromArray
// pure-fn registrations. Same file as the typeErrors pure-fns
// (run-types-pure-fns.ts) — the dependency check uses this for integrity
// validation.
const unknownKeysPureFnFilePath = "packages/ts-go-run-types/src/run-types-pure-fns.ts"

// objectKeysContext captures the data needed to emit the
// callCheckUnknownProperties call for an object/interface — the
// known-key arrays (JIT children and ALL children) and the variable
// names used to refer to them in the closure prologue.
//
// Mirrors mion's addObjectPropsToContext output (interface.ts:232-269).
type objectKeysContext struct {
	keysName          string   // variable name in closure scope for the JIT-children key array
	allKeysName       string   // variable name in closure scope for the ALL-children key array
	jitChildrenNames  []string // sorted unique JIT-children property names
	allChildrenNames  []string // sorted unique ALL-children property names
	hasNonJitChildren bool     // true when JIT children is a strict subset of ALL children
}

// addObjectPropsToContext computes (and registers in the closure
// prologue) the known-key arrays for an interface/object. The arrays
// are emitted once per unique RunType per closure via context items —
// mion does the same so the same hash → same key-array literal.
//
// Mirrors mion's addObjectPropsToContext (interface.ts:243-269).
func addObjectPropsToContext(rt *protocol.RunType, ctx *EmitContext) objectKeysContext {
	jitNames, allNames := collectObjectChildNames(rt, ctx)

	jitChildrenNames := dedupSortStrings(jitNames)
	allChildrenNames := dedupSortStrings(allNames)

	hasNonJitChildren := !sameStringSet(jitChildrenNames, allChildrenNames)

	// Variable names mirror mion's `k_<hash>` / `kA_<hash>` scheme. We
	// use the RunType ID as the hash so the same canonical object
	// reuses the same context-item key across emit calls.
	keysName := "k_" + rt.ID
	allKeysName := "kA_" + rt.ID

	if !ctx.HasContextItem(keysName) {
		ctx.SetContextItem(keysName, "const "+keysName+" = "+arrayToJSLiteral(jitChildrenNames))
	}
	if hasNonJitChildren && !ctx.HasContextItem(allKeysName) {
		ctx.SetContextItem(allKeysName, "const "+allKeysName+" = "+arrayToJSLiteral(allChildrenNames))
	}

	return objectKeysContext{
		keysName:          keysName,
		allKeysName:       allKeysName,
		jitChildrenNames:  jitChildrenNames,
		allChildrenNames:  allChildrenNames,
		hasNonJitChildren: hasNonJitChildren,
	}
}

// collectObjectChildNames returns two slices of named property names —
// the JIT-included subset, and the FULL set (including children dropped
// by JIT for being function-typed, static, or otherwise not part of the
// serialised shape). Both lists exclude index-signature children (those
// don't have property names) AND children with empty names.
//
// Mirrors mion's getJitChildren + getChildRunTypes filter+name pluck
// in addObjectPropsToContext.
func collectObjectChildNames(rt *protocol.RunType, ctx *EmitContext) (jitNames []string, allNames []string) {
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == protocol.KindIndexSignature {
			continue
		}
		if resolved.Name == "" {
			continue
		}
		allNames = append(allNames, resolved.Name)
		// JIT child filter: drop static + function-like (PropertySignature
		// wrapping a function, KindMethod, KindMethodSignature) entries
		// the JIT skips. Match emitObjectPrepareForJson's filter.
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		// PropertySignature / Property wrapping a function-typed child:
		// the parent's JIT chain drops them too.
		if (resolved.Kind == protocol.KindProperty || resolved.Kind == protocol.KindPropertySignature) && resolved.Child != nil {
			grandchild := ctx.ResolveRef(resolved.Child)
			if grandchild != nil && isFunctionLikeKind(grandchild.Kind) {
				continue
			}
		}
		jitNames = append(jitNames, resolved.Name)
	}
	return jitNames, allNames
}

// dedupSortStrings deduplicates + sorts a string slice. Sorting keeps
// the emitted array literal deterministic across runs (Go's `for k :=
// range map` iteration order is random); mion's New JS Set + Array.from
// preserves insertion order, but our Go side has to be deterministic
// for byte-stable cache outputs.
func dedupSortStrings(in []string) []string {
	if len(in) == 0 {
		return nil
	}
	seen := make(map[string]struct{}, len(in))
	out := make([]string, 0, len(in))
	for _, s := range in {
		if _, ok := seen[s]; ok {
			continue
		}
		seen[s] = struct{}{}
		out = append(out, s)
	}
	sort.Strings(out)
	return out
}

// sameStringSet reports whether two slices (both already deduped) contain
// the same string set.
func sameStringSet(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// arrayToJSLiteral renders a string slice as a JS array literal — each
// element quoted as a single-quoted string with backslash + single-quote
// escapes applied. Mirrors mion's arrayToLiteral helper.
func arrayToJSLiteral(items []string) string {
	if len(items) == 0 {
		return "[]"
	}
	parts := make([]string, 0, len(items))
	for _, item := range items {
		parts = append(parts, quoteJS(item))
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// objectHasIndexSignatureChild reports whether the object has an
// index-signature child that the JIT didn't filter out. Index sigs
// flip the "any unknown key is unknown" semantic: when present, every
// key matching the index pattern is considered "known".
func objectHasIndexSignatureChild(rt *protocol.RunType, ctx *EmitContext) bool {
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == protocol.KindIndexSignature {
			return true
		}
	}
	return false
}

// callCheckUnknownPropertiesForHas mirrors mion's
// callCheckUnknownProperties (interface.ts:272-300) for the
// hasUnknownKeys family. Emits a JS expression that's `true` when
// the value has at least one key outside the known-keys array.
//
// When returnKeys=true the expression returns the array of unknown
// keys instead of a boolean — used by strip/error/undefined emitters.
//
// checkObject controls whether the result is wrapped in a
// `typeof v === 'object' && v !== null && …` guard. mion sets it from
// `!this.isPartOfUnion()` — for our purposes, every top-level emit IS
// safe to guard because we never compose hasUnknownKeys into a union
// condition. The `keepObjectCheck` parameter exposes this lever.
func callCheckUnknownPropertiesForHas(rt *protocol.RunType, ctx *EmitContext, returnKeys bool) string {
	keysCtx := addObjectPropsToContext(rt, ctx)
	if len(keysCtx.jitChildrenNames) == 0 && len(keysCtx.allChildrenNames) == 0 {
		return ""
	}
	v := ctx.Vλl
	conditional := keysCtx.keysName
	if keysCtx.hasNonJitChildren {
		// Honor the `checkNonJitProps` runtime option — when truthy, fold
		// every declared key (including non-JIT) into "known" set.
		optsArg := ctx.ArgName("θpts")
		if optsArg != "" {
			conditional = optsArg + ".checkNonJitProps ? " + keysCtx.allKeysName + " : " + keysCtx.keysName
		}
	}
	if returnKeys {
		ctx.AddPureFnDependency("mion", "getUnknownKeysFromArray", unknownKeysPureFnFilePath)
		fnVar := pureFnAlias("getUnknownKeysFromArray")
		if !ctx.HasContextItem(fnVar) {
			ctx.SetContextItem(fnVar, "const "+fnVar+" = utl.getPureFn('mion::getUnknownKeysFromArray')")
		}
		return fnVar + "(" + v + ", " + conditional + ")"
	}
	ctx.AddPureFnDependency("mion", "hasUnknownKeysFromArray", unknownKeysPureFnFilePath)
	fnVar := pureFnAlias("hasUnknownKeysFromArray")
	if !ctx.HasContextItem(fnVar) {
		ctx.SetContextItem(fnVar, "const "+fnVar+" = utl.getPureFn('mion::hasUnknownKeysFromArray')")
	}
	// Object guard around the pure-fn call: mion's emit prepends
	// `typeof v === 'object' && v !== null` so non-object inputs don't
	// reach the pure-fn (which expects an object). Match that.
	return "(typeof " + v + " === 'object' && " + v + " !== null && " + fnVar + "(" + v + ", " + conditional + "))"
}

// collectObjectHasUnknownKeysChildren is a helper that returns the
// per-child hasUnknownKeys expressions for an object's children, plus a
// flag indicating whether the object has an index-signature child.
// Mirrors super.emitHasUnknownKeys (the CollectionRunType default) but
// inlined here so the interface emit can stitch parent+children
// together with `||`.
func collectObjectHasUnknownKeysChildren(rt *protocol.RunType, ctx *EmitContext) ([]string, bool) {
	var parts []string
	hasIndex := false
	for _, child := range rt.Children {
		resolved := ctx.ResolveRef(child)
		if resolved == nil {
			continue
		}
		if resolved.Kind == protocol.KindIndexSignature {
			hasIndex = true
		}
		if resolved.IsStatic {
			continue
		}
		if isFunctionLikeKind(resolved.Kind) {
			continue
		}
		childJit := ctx.CompileChild(child, CodeE)
		if childJit.Type == CodeNS {
			// Children with NS propagate upward — but for unknown-keys
			// emit we tolerate them as "no contribution" (the parent
			// renderer drops the factory if needed). Skip the child.
			continue
		}
		if childJit.Code == "" {
			continue
		}
		parts = append(parts, childJit.Code)
	}
	return parts, hasIndex
}

// joinOr joins JS expressions with ` || `. Wraps in parens when there's
// more than one to keep precedence stable when the result is nested.
func joinOr(parts []string) string {
	if len(parts) == 0 {
		return ""
	}
	if len(parts) == 1 {
		return parts[0]
	}
	return "(" + strings.Join(parts, " || ") + ")"
}

// trimWhitespace removes leading + trailing whitespace and the trailing
// semicolon. Used inside Finalize-detection helpers to recognise
// "essentially empty" bodies.
func trimWhitespace(code string) string {
	out := strings.TrimSpace(code)
	for strings.HasSuffix(out, ";") {
		out = strings.TrimSpace(out[:len(out)-1])
	}
	return out
}
