package typefns

import (
	"github.com/mionkit/ts-run-types/internal/diag"
	"github.com/mionkit/ts-run-types/internal/protocol"
)

// leafKindToRootCode maps an unsupported root leaf kind to a per-family
// root-error code via the supplied family-specific map. Returns "" for
// kinds not in the map — the renderer falls back to silent skip (no
// alwaysThrow factory) so unknown future kinds don't surface diagnostics
// without a registered code. See docs/UNSUPPORTED-KINDS.md.
type rootCodeMap struct {
	never           string // KindNever
	nonSerializable string // KindPromise + KindClass.SubKindNonSerializable
	function        string // KindFunction / KindMethod / KindMethodSignature / KindCallSignature
	symbol          string // KindSymbol — see docs FAQ for why this is unsupported
}

func (m rootCodeMap) codeFor(leaf *protocol.RunType) string {
	if leaf == nil {
		return ""
	}
	switch leaf.Kind {
	case protocol.KindNever:
		return m.never
	case protocol.KindPromise:
		return m.nonSerializable
	case protocol.KindFunction,
		protocol.KindMethod,
		protocol.KindMethodSignature,
		protocol.KindCallSignature:
		return m.function
	case protocol.KindSymbol:
		return m.symbol
	case protocol.KindLiteral:
		// A symbol-flavored literal under the `noLiterals` IsTypeOptions
		// variant degrades to the bare-symbol validator — same misleading
		// shape as plain `createIsType<symbol>()`, so we route to the
		// symbol root code and let the alwaysThrow path emit the same
		// diagnostic. See istype.go's emitLiteralBaseKind symbol arm.
		for _, flag := range leaf.Flags {
			if flag == "symbol" {
				return m.symbol
			}
		}
	case protocol.KindClass:
		if leaf.SubKind == protocol.SubKindNonSerializable {
			return m.nonSerializable
		}
	}
	return ""
}

// Per-emitter DiagCodeFor implementations. Each emitter declares a flat
// map from slot to its family's diag code; the shared dispatch helper on
// EmitContext looks the active emitter up via type assertion at throw /
// silent-skip sites. Concentrated in one file so adding a new family
// (or a new slot) is one edit per emitter, not a hunt-and-peck across
// the emit files.

var prepareForJsonCodes = map[DiagSlot]string{
	SlotNeverRoot:           diag.CodePJNeverRoot,
	SlotNonSerializableRoot: diag.CodePJNonSerializableRoot,
	SlotFunctionRoot:        diag.CodePJFunctionRoot,
	SlotArrayElement:        diag.CodePJArrayElement,
	SlotFunctionPropDropped: diag.CodePJFunctionPropDropped,
	SlotMethodDropped:       diag.CodePJMethodDropped,
	SlotStaticDropped:       diag.CodePJStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodePJSymbolKeyedDropped,
}

func (PrepareForJsonEmitter) DiagCodeFor(slot DiagSlot) string { return prepareForJsonCodes[slot] }

var prepareForJsonRootCodes = rootCodeMap{
	never:           diag.CodePJNeverRoot,
	nonSerializable: diag.CodePJNonSerializableRoot,
	function:        diag.CodePJFunctionRoot,
	symbol:          diag.CodePJSymbolRoot,
}

func (PrepareForJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return prepareForJsonRootCodes.codeFor(leaf)
}

var prepareForJsonSafeCodes = map[DiagSlot]string{
	SlotNeverRoot:           diag.CodePJSNeverRoot,
	SlotNonSerializableRoot: diag.CodePJSNonSerializableRoot,
	SlotFunctionRoot:        diag.CodePJSFunctionRoot,
	SlotArrayElement:        diag.CodePJSArrayElement,
	SlotFunctionPropDropped: diag.CodePJSFunctionPropDropped,
	SlotMethodDropped:       diag.CodePJSMethodDropped,
	SlotStaticDropped:       diag.CodePJSStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodePJSSymbolKeyedDropped,
}

func (PrepareForJsonSafeEmitter) DiagCodeFor(slot DiagSlot) string {
	return prepareForJsonSafeCodes[slot]
}

var prepareForJsonSafeRootCodes = rootCodeMap{
	never:           diag.CodePJSNeverRoot,
	nonSerializable: diag.CodePJSNonSerializableRoot,
	function:        diag.CodePJSFunctionRoot,
	symbol:          diag.CodePJSSymbolRoot,
}

func (PrepareForJsonSafeEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return prepareForJsonSafeRootCodes.codeFor(leaf)
}

var restoreFromJsonCodes = map[DiagSlot]string{
	SlotNeverRoot:           diag.CodeRJNeverRoot,
	SlotNonSerializableRoot: diag.CodeRJNonSerializableRoot,
	SlotFunctionRoot:        diag.CodeRJFunctionRoot,
	SlotArrayElement:        diag.CodeRJArrayElement,
	SlotFunctionPropDropped: diag.CodeRJFunctionPropDropped,
	SlotMethodDropped:       diag.CodeRJMethodDropped,
	SlotStaticDropped:       diag.CodeRJStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodeRJSymbolKeyedDropped,
}

func (RestoreFromJsonEmitter) DiagCodeFor(slot DiagSlot) string { return restoreFromJsonCodes[slot] }

var restoreFromJsonRootCodes = rootCodeMap{
	never:           diag.CodeRJNeverRoot,
	nonSerializable: diag.CodeRJNonSerializableRoot,
	function:        diag.CodeRJFunctionRoot,
	symbol:          diag.CodeRJSymbolRoot,
}

func (RestoreFromJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return restoreFromJsonRootCodes.codeFor(leaf)
}

var stringifyJsonCodes = map[DiagSlot]string{
	SlotNeverRoot:           diag.CodeSJNeverRoot,
	SlotNonSerializableRoot: diag.CodeSJNonSerializableRoot,
	SlotFunctionRoot:        diag.CodeSJFunctionRoot,
	SlotArrayElement:        diag.CodeSJArrayElement,
	SlotFunctionPropDropped: diag.CodeSJFunctionPropDropped,
	SlotMethodDropped:       diag.CodeSJMethodDropped,
	SlotStaticDropped:       diag.CodeSJStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodeSJSymbolKeyedDropped,
}

func (StringifyJsonEmitter) DiagCodeFor(slot DiagSlot) string { return stringifyJsonCodes[slot] }

var stringifyJsonRootCodes = rootCodeMap{
	never:           diag.CodeSJNeverRoot,
	nonSerializable: diag.CodeSJNonSerializableRoot,
	function:        diag.CodeSJFunctionRoot,
	symbol:          diag.CodeSJSymbolRoot,
}

func (StringifyJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return stringifyJsonRootCodes.codeFor(leaf)
}

var toBinaryCodes = map[DiagSlot]string{
	SlotNeverRoot:           diag.CodeTBNeverRoot,
	SlotNonSerializableRoot: diag.CodeTBNonSerializableRoot,
	SlotFunctionRoot:        diag.CodeTBFunctionRoot,
	SlotArrayElement:        diag.CodeTBArrayElement,
	SlotNonSerializableElem: diag.CodeTBNonSerializableElem,
	SlotFunctionPropDropped: diag.CodeTBFunctionPropDropped,
	SlotMethodDropped:       diag.CodeTBMethodDropped,
	SlotStaticDropped:       diag.CodeTBStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodeTBSymbolKeyedDropped,
}

func (ToBinaryEmitter) DiagCodeFor(slot DiagSlot) string { return toBinaryCodes[slot] }

var toBinaryRootCodes = rootCodeMap{
	never:           diag.CodeTBNeverRoot,
	nonSerializable: diag.CodeTBNonSerializableRoot,
	function:        diag.CodeTBFunctionRoot,
	symbol:          diag.CodeTBSymbolRoot,
}

func (ToBinaryEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return toBinaryRootCodes.codeFor(leaf)
}

var fromBinaryCodes = map[DiagSlot]string{
	SlotNeverRoot:           diag.CodeFBNeverRoot,
	SlotNonSerializableRoot: diag.CodeFBNonSerializableRoot,
	SlotFunctionRoot:        diag.CodeFBFunctionRoot,
	SlotArrayElement:        diag.CodeFBArrayElement,
	SlotNonSerializableElem: diag.CodeFBNonSerializableElem,
	SlotFunctionPropDropped: diag.CodeFBFunctionPropDropped,
	SlotMethodDropped:       diag.CodeFBMethodDropped,
	SlotStaticDropped:       diag.CodeFBStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodeFBSymbolKeyedDropped,
}

func (FromBinaryEmitter) DiagCodeFor(slot DiagSlot) string { return fromBinaryCodes[slot] }

var fromBinaryRootCodes = rootCodeMap{
	never:           diag.CodeFBNeverRoot,
	nonSerializable: diag.CodeFBNonSerializableRoot,
	function:        diag.CodeFBFunctionRoot,
	symbol:          diag.CodeFBSymbolRoot,
}

func (FromBinaryEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return fromBinaryRootCodes.codeFor(leaf)
}

var isTypeCodes = map[DiagSlot]string{
	SlotNonSerializableRoot: diag.CodeISNonSerializableRoot,
	SlotFunctionPropDropped: diag.CodeISFunctionPropDropped,
	SlotMethodDropped:       diag.CodeISMethodDropped,
	SlotStaticDropped:       diag.CodeISStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodeISSymbolKeyedDropped,
	SlotRootAnyUnknown:      diag.CodeISRootAnyUnknown,
}

func (IsTypeEmitter) DiagCodeFor(slot DiagSlot) string { return isTypeCodes[slot] }

var isTypeRootCodes = rootCodeMap{
	never:           "", // isType validates Never as "no inhabitants" — handled by existing never arm, not unsupported
	nonSerializable: diag.CodeISNonSerializableRoot,
	function:        "", // isType validates function-kinds as `typeof === 'function'` — supported
	symbol:          diag.CodeISSymbolRoot,
}

func (IsTypeEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return isTypeRootCodes.codeFor(leaf)
}

var typeErrorsCodes = map[DiagSlot]string{
	SlotNonSerializableRoot: diag.CodeTENonSerializableRoot,
	SlotFunctionPropDropped: diag.CodeTEFunctionPropDropped,
	SlotMethodDropped:       diag.CodeTEMethodDropped,
	SlotStaticDropped:       diag.CodeTEStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodeTESymbolKeyedDropped,
	SlotRootAnyUnknown:      diag.CodeTERootAnyUnknown,
}

func (TypeErrorsEmitter) DiagCodeFor(slot DiagSlot) string { return typeErrorsCodes[slot] }

var typeErrorsRootCodes = rootCodeMap{
	never:           "",
	nonSerializable: diag.CodeTENonSerializableRoot,
	function:        "",
	symbol:          diag.CodeTESymbolRoot,
}

func (TypeErrorsEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return typeErrorsRootCodes.codeFor(leaf)
}

var hasUnknownKeysCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diag.CodeHUKFunctionPropDropped,
}

func (HasUnknownKeysEmitter) DiagCodeFor(slot DiagSlot) string { return hasUnknownKeysCodes[slot] }

var stripUnknownKeysCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diag.CodeSUKFunctionPropDropped,
}

func (StripUnknownKeysEmitter) DiagCodeFor(slot DiagSlot) string { return stripUnknownKeysCodes[slot] }

var unknownKeyErrorsCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diag.CodeUKEFunctionPropDropped,
}

func (UnknownKeyErrorsEmitter) DiagCodeFor(slot DiagSlot) string { return unknownKeyErrorsCodes[slot] }

var unknownKeysToUndefinedCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diag.CodeUKUFunctionPropDropped,
}

func (UnknownKeysToUndefinedEmitter) DiagCodeFor(slot DiagSlot) string {
	return unknownKeysToUndefinedCodes[slot]
}

var unknownKeysToUndefinedWireCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diag.CodeUKWFunctionPropDropped,
}

func (UnknownKeysToUndefinedWireEmitter) DiagCodeFor(slot DiagSlot) string {
	return unknownKeysToUndefinedWireCodes[slot]
}
