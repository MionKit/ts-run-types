package resolver

import (
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/compiled/purefns"
	"github.com/mionkit/ts-runtypes/internal/compiled/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/diag"
	"github.com/mionkit/ts-runtypes/internal/marker"
	"github.com/mionkit/ts-runtypes/internal/textpos"
)

// overrideRecord remembers the first override registered for a (type, family)
// pair so a later, conflicting registration can be flagged (OVR001).
type overrideRecord struct {
	hash string
	site diag.Site
}

// overrideCalleePrefix is the cheap pre-filter for the override-collection pass:
// every public `overrideX<T>(pureFn, id)` factory is named `override…`, so a
// call whose callee identifier lacks this prefix is skipped before the (heavy)
// signature resolution. The brands remain the correctness contract — the prefix
// only short-circuits the common non-override call.
const overrideCalleePrefix = "override"

// overrideSite is the resolved shape of one overrideX<T>(pureFn, id) call: the
// overridden type, the family op key the trailing InjectTypeFnArgs<T, fnKey>
// names, and the inline pure-fn argument node.
type overrideSite struct {
	typeArgument *checker.Type
	fnKey        string
	fnArg        *ast.Node
}

// ensureOverrides runs the one-time, whole-program override-collection pass for
// the current Program. It finds every `overrideX<T>(pureFn)` call, extracts the
// cfn (pure-fn body), resolves T's base structural key, and installs the
// override map on the cache so all subsequent id assignments fold the
// `|cfn:<family>:<hash>` suffix. MUST run before any AssignID — hence it is
// called at the top of dispatchScanFiles. Idempotent per Program (guarded by
// overridesBuilt, reset on SetProgram / Reset).
//
// The pass walks every program source file regardless of which files the
// triggering scan requested: an override declared in one file shifts the ids of
// types used in any other, so the map must be complete before the first id is
// minted.
func (resolver *Resolver) ensureOverrides() {
	if resolver.overridesBuilt {
		return
	}
	resolver.overridesBuilt = true
	if resolver.Program == nil || resolver.Program.TS == nil || resolver.checker == nil {
		return
	}
	overrides := map[string]map[string]string{}
	var entries []purefns.Entry
	var diagnostics []diag.Diagnostic
	seen := map[string]struct{}{}
	firstByKey := map[string]overrideRecord{} // "<baseKey>|<fnKey>" → first registration
	state := resolver.scanStateFor(resolver.checker)
	// Base keys for the map are computed WITHOUT folding (a fresh plain
	// computer): a leaf/independent override target's base key is override-free,
	// which is the common case. The MAIN cache computer folds children's
	// suffixes when composing containing types, so propagation still holds.
	baseComputer := typeid.New(resolver.checker)
	for _, sourceFile := range resolver.Program.TS.SourceFiles() {
		if sourceFile == nil || sourceFile.IsDeclarationFile {
			continue
		}
		forEachCallExpression(sourceFile, func(call *ast.Node) bool {
			site, ok := state.detectOverrideSite(call)
			if !ok {
				return true
			}
			cfn, cfnOK := purefns.ExtractOverrideFn(resolver.checker, sourceFile, site.fnArg)
			if !cfnOK {
				return true
			}
			baseKey := baseComputer.Compute(site.typeArgument)
			callSite := textpos.NodeSite(sourceFile.FileName(), sourceFile, call)
			dedupKey := baseKey + "|" + site.fnKey
			// Conflict: a different body already overrides this (type, family).
			// Keep the first (deterministic source order) and flag the later one
			// — anything else makes the cache entry order-dependent. Same body
			// (same CodeHash) dedups silently.
			if first, exists := firstByKey[dedupKey]; exists {
				if first.hash != cfn.FunctionName {
					diagnostics = append(diagnostics, diag.NewWithRelated(
						diag.CodeDuplicateOverride, callSite, []string{site.fnKey},
						diag.Related{Site: first.site, Message: "First overridden here"},
					))
				}
				return true
			}
			firstByKey[dedupKey] = overrideRecord{hash: cfn.FunctionName, site: callSite}
			// validate is a shared cross-family dependency: JSON / binary union
			// decoders call val_<member> to narrow. Overriding it reaches past
			// createValidate<T>(), so flag the site (Warning — the build proceeds).
			if site.fnKey == "val" {
				diagnostics = append(diagnostics, diag.New(diag.CodeOverrideValidateCrossFamily, callSite))
			}
			families := overrides[baseKey]
			if families == nil {
				families = map[string]string{}
				overrides[baseKey] = families
			}
			// The suffix folds the cfn's body-hash name; the family op key
			// ("val", "jsonEncoder", …) groups it.
			families[site.fnKey] = cfn.FunctionName
			if _, dup := seen[cfn.Key()]; !dup {
				seen[cfn.Key()] = struct{}{}
				entries = append(entries, cfn)
			}
			return true
		})
	}
	resolver.overrideEntries = entries
	resolver.overrideDiagnostics = diagnostics
	// Skip installation when nothing was overridden so the no-override path is
	// byte-identical (no computer recreation, no fold lookups).
	if len(overrides) > 0 {
		resolver.cache.SetOverrides(overrides)
	}
}

// detectOverrideSite reports whether call is an `overrideX<T>(pureFn, id)` site
// and returns its resolved shape. Recognition is shape-based: a trailing
// InjectTypeFnArgs<T, fnKey> slot AND a PureFunction-branded argument — a combo
// no createX factory carries — gated by the cheap `override` callee-name
// pre-filter. A single-family marker is required (overrides never multiplex).
func (state scanState) detectOverrideSite(call *ast.Node) (overrideSite, bool) {
	callExpression := call.AsCallExpression()
	if callExpression == nil || callExpression.Expression == nil {
		return overrideSite{}, false
	}
	callee := callExpression.Expression
	if callee.Kind != ast.KindIdentifier || !strings.HasPrefix(callee.Text(), overrideCalleePrefix) {
		return overrideSite{}, false
	}
	signature := checker.Checker_getResolvedSignature(state.scanChecker, call, nil, 0)
	if signature == nil {
		return overrideSite{}, false
	}
	parameters := checker.Signature_parameters(signature)
	if len(parameters) == 0 {
		return overrideSite{}, false
	}
	lastIndex := len(parameters) - 1
	var typeArgument *checker.Type
	var fnKey string
	pureFnParamIndex := -1
	for paramIndex := 0; paramIndex <= lastIndex; paramIndex++ {
		paramSymbol := parameters[paramIndex]
		if paramSymbol == nil {
			continue
		}
		paramType := checker.Checker_getTypeOfSymbol(state.scanChecker, paramSymbol)
		kind, typeArg, matched := state.detectMarker(paramType)
		if !matched {
			continue
		}
		switch kind {
		case marker.KindInjectTypeFnArgs:
			if paramIndex != lastIndex {
				continue
			}
			typeArgument = typeArg
			if fnKeys, fnOK := marker.FnKeysForInjectTypeFnArgs(state.scanChecker, paramType, state.resolver.marker); fnOK && len(fnKeys) == 1 {
				fnKey = fnKeys[0]
			}
		case marker.KindPureFunction:
			pureFnParamIndex = paramIndex
		}
	}
	if typeArgument == nil || fnKey == "" || pureFnParamIndex < 0 {
		return overrideSite{}, false
	}
	if marker.IsFreeTypeParameter(typeArgument) {
		return overrideSite{}, false
	}
	if callExpression.Arguments == nil || pureFnParamIndex >= len(callExpression.Arguments.Nodes) {
		return overrideSite{}, false
	}
	fnArg := callExpression.Arguments.Nodes[pureFnParamIndex]
	if fnArg == nil {
		return overrideSite{}, false
	}
	return overrideSite{typeArgument: typeArgument, fnKey: fnKey, fnArg: fnArg}, true
}
