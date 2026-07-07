package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// TestDataOnly_TypeName_NamedInterfaceArg — the headline behavior. When the
// marker call site instantiates DataOnly with a NAMED interface, the
// resolved root type is a synthesized mapped object whose alias is dropped
// by TS during the conditional+key-filtering map. The serializer must
// recognise this special case and stamp TypeName = "DataOnly<RootCircular>"
// so the inlining predicate keeps the entry external (DefaultIsRTInlined
// treats TypeName-empty KindObjectLiteral as inlinable).
func TestDataOnly_TypeName_NamedInterfaceArg(t *testing.T) {
	const code = `import {getRunTypeId, type DataOnly} from '@ts-runtypes/core';
interface RootCircular {
  isRoot: true;
  ciRoort?: RootCircular;
}
getRunTypeId<DataOnly<RootCircular>>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %d", tn.Kind)
	}
	want := "DataOnly<RootCircular>"
	if tn.TypeName != want {
		t.Fatalf("expected TypeName=%q, got %q", want, tn.TypeName)
	}
}

// TestDataOnly_TypeName_NamedAliasArg — same headline behavior, but the
// inner T is a `type` alias rather than an `interface`. The composed name
// should still pick up the alias' symbol name.
func TestDataOnly_TypeName_NamedAliasArg(t *testing.T) {
	const code = `import {getRunTypeId, type DataOnly} from '@ts-runtypes/core';
type User = {id: number; name: string};
getRunTypeId<DataOnly<User>>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %d", tn.Kind)
	}
	want := "DataOnly<User>"
	if tn.TypeName != want {
		t.Fatalf("expected TypeName=%q, got %q", want, tn.TypeName)
	}
}

// TestDataOnly_TypeName_AnonymousArg — when the user feeds DataOnly an
// inline object literal with no name (`DataOnly<{a, b}>`), there's no
// inner name to inherit. The recognition path bails out and TypeName
// stays empty — same behavior as any other anonymous compound. Stamping
// `"DataOnly<__type>"` or `"DataOnly<>"` would just be misleading labels.
func TestDataOnly_TypeName_AnonymousArg(t *testing.T) {
	const code = `import {getRunTypeId, type DataOnly} from '@ts-runtypes/core';
getRunTypeId<DataOnly<{a: number; b: number}>>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %d", tn.Kind)
	}
	if tn.TypeName != "" {
		t.Fatalf("expected TypeName=\"\" for DataOnly over an anonymous object literal, got %q", tn.TypeName)
	}
}

// TestDataOnly_NonDataOnlyMappedTypeUntouched — a user-defined mapped type
// with the same key-filtering shape MUST be left alone. Only DataOnly gets
// the special-case TypeName stamp; everything else preserves current
// "anonymous mapped result" behavior (TypeName empty → inlines).
func TestDataOnly_NonDataOnlyMappedTypeUntouched(t *testing.T) {
	const code = `import {getRunTypeId} from '@ts-runtypes/core';
type StripSymbols<T> = T extends object
  ? {[K in keyof T as K extends symbol ? never : K]: StripSymbols<T[K]>}
  : T;
interface User {id: number; name: string}
getRunTypeId<StripSymbols<User>>();
`
	_, tn := resolveInline(t, code)
	if tn.Kind != protocol.KindObjectLiteral {
		t.Fatalf("expected KindObjectLiteral, got %d", tn.Kind)
	}
	// A user-defined StripSymbols mapped type follows the existing rule: no
	// alias, no interface symbol, no special treatment → TypeName empty.
	if tn.TypeName != "" {
		t.Fatalf("expected TypeName=\"\" for user-defined mapped result, got %q", tn.TypeName)
	}
}
