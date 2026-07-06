package typefunctions

import (
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
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
		// A symbol-flavored literal under the `noLiterals` ValidateOptions
		// variant degrades to the bare-symbol validator — same misleading
		// shape as plain `createValidate<symbol>()`, so we route to the
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
	SlotNeverRoot:                  diagnostics.CodePJNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodePJNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodePJFunctionRoot,
	SlotArrayElement:               diagnostics.CodePJArrayElement,
	SlotFunctionPropDropped:        diagnostics.CodePJFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodePJMethodDropped,
	SlotStaticDropped:              diagnostics.CodePJStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodePJSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodePJUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodePJNonSerializablePropDrop,
}

func (PrepareForJsonEmitter) DiagCodeFor(slot DiagSlot) string { return prepareForJsonCodes[slot] }

var prepareForJsonRootCodes = rootCodeMap{
	never:           diagnostics.CodePJNeverRoot,
	nonSerializable: diagnostics.CodePJNonSerializableRoot,
	function:        diagnostics.CodePJFunctionRoot,
	symbol:          diagnostics.CodePJSymbolRoot,
}

func (PrepareForJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return prepareForJsonRootCodes.codeFor(leaf)
}

var prepareForJsonSafeCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodePJSNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodePJSNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodePJSFunctionRoot,
	SlotArrayElement:               diagnostics.CodePJSArrayElement,
	SlotFunctionPropDropped:        diagnostics.CodePJSFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodePJSMethodDropped,
	SlotStaticDropped:              diagnostics.CodePJSStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodePJSSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodePJSUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodePJSNonSerializablePropDrop,
}

func (PrepareForJsonSafeEmitter) DiagCodeFor(slot DiagSlot) string {
	return prepareForJsonSafeCodes[slot]
}

var prepareForJsonSafeRootCodes = rootCodeMap{
	never:           diagnostics.CodePJSNeverRoot,
	nonSerializable: diagnostics.CodePJSNonSerializableRoot,
	function:        diagnostics.CodePJSFunctionRoot,
	symbol:          diagnostics.CodePJSSymbolRoot,
}

func (PrepareForJsonSafeEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return prepareForJsonSafeRootCodes.codeFor(leaf)
}

var restoreFromJsonCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodeRJNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodeRJNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodeRJFunctionRoot,
	SlotArrayElement:               diagnostics.CodeRJArrayElement,
	SlotFunctionPropDropped:        diagnostics.CodeRJFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeRJMethodDropped,
	SlotStaticDropped:              diagnostics.CodeRJStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeRJSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeRJUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeRJNonSerializablePropDrop,
}

func (RestoreFromJsonEmitter) DiagCodeFor(slot DiagSlot) string { return restoreFromJsonCodes[slot] }

var restoreFromJsonRootCodes = rootCodeMap{
	never:           diagnostics.CodeRJNeverRoot,
	nonSerializable: diagnostics.CodeRJNonSerializableRoot,
	function:        diagnostics.CodeRJFunctionRoot,
	symbol:          diagnostics.CodeRJSymbolRoot,
}

func (RestoreFromJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return restoreFromJsonRootCodes.codeFor(leaf)
}

var stringifyJsonCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodeSJNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodeSJNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodeSJFunctionRoot,
	SlotArrayElement:               diagnostics.CodeSJArrayElement,
	SlotFunctionPropDropped:        diagnostics.CodeSJFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeSJMethodDropped,
	SlotStaticDropped:              diagnostics.CodeSJStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeSJSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeSJUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeSJNonSerializablePropDrop,
}

func (StringifyJsonEmitter) DiagCodeFor(slot DiagSlot) string { return stringifyJsonCodes[slot] }

var stringifyJsonRootCodes = rootCodeMap{
	never:           diagnostics.CodeSJNeverRoot,
	nonSerializable: diagnostics.CodeSJNonSerializableRoot,
	function:        diagnostics.CodeSJFunctionRoot,
	symbol:          diagnostics.CodeSJSymbolRoot,
}

func (StringifyJsonEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return stringifyJsonRootCodes.codeFor(leaf)
}

var toBinaryCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodeTBNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodeTBNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodeTBFunctionRoot,
	SlotArrayElement:               diagnostics.CodeTBArrayElement,
	SlotNonSerializableElem:        diagnostics.CodeTBNonSerializableElem,
	SlotFunctionPropDropped:        diagnostics.CodeTBFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeTBMethodDropped,
	SlotStaticDropped:              diagnostics.CodeTBStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeTBSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeTBUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeTBNonSerializablePropDrop,
}

func (ToBinaryEmitter) DiagCodeFor(slot DiagSlot) string { return toBinaryCodes[slot] }

var toBinaryRootCodes = rootCodeMap{
	never:           diagnostics.CodeTBNeverRoot,
	nonSerializable: diagnostics.CodeTBNonSerializableRoot,
	function:        diagnostics.CodeTBFunctionRoot,
	symbol:          diagnostics.CodeTBSymbolRoot,
}

func (ToBinaryEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return toBinaryRootCodes.codeFor(leaf)
}

var fromBinaryCodes = map[DiagSlot]string{
	SlotNeverRoot:                  diagnostics.CodeFBNeverRoot,
	SlotNonSerializableRoot:        diagnostics.CodeFBNonSerializableRoot,
	SlotFunctionRoot:               diagnostics.CodeFBFunctionRoot,
	SlotArrayElement:               diagnostics.CodeFBArrayElement,
	SlotNonSerializableElem:        diagnostics.CodeFBNonSerializableElem,
	SlotFunctionPropDropped:        diagnostics.CodeFBFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeFBMethodDropped,
	SlotStaticDropped:              diagnostics.CodeFBStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeFBSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeFBUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeFBNonSerializablePropDrop,
}

func (FromBinaryEmitter) DiagCodeFor(slot DiagSlot) string { return fromBinaryCodes[slot] }

var fromBinaryRootCodes = rootCodeMap{
	never:           diagnostics.CodeFBNeverRoot,
	nonSerializable: diagnostics.CodeFBNonSerializableRoot,
	function:        diagnostics.CodeFBFunctionRoot,
	symbol:          diagnostics.CodeFBSymbolRoot,
}

func (FromBinaryEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return fromBinaryRootCodes.codeFor(leaf)
}

var validateCodes = map[DiagSlot]string{
	SlotNonSerializableRoot:        diagnostics.CodeVLNonSerializableRoot,
	SlotFunctionPropDropped:        diagnostics.CodeVLFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeVLMethodDropped,
	SlotStaticDropped:              diagnostics.CodeVLStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeVLSymbolKeyedDropped,
	SlotUnionMemberDropped:         diagnostics.CodeVLUnionMemberDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeVLNonSerializablePropDrop,
	SlotRootAnyUnknown:             diagnostics.CodeVLRootAnyUnknown,
}

func (ValidateEmitter) DiagCodeFor(slot DiagSlot) string { return validateCodes[slot] }

var validateRootCodes = rootCodeMap{
	never:           "", // validate validates Never as "no inhabitants" — handled by existing never arm, not unsupported
	nonSerializable: diagnostics.CodeVLNonSerializableRoot,
	function:        "", // validate validates function-kinds as `typeof === 'function'` — supported
	symbol:          diagnostics.CodeVLSymbolRoot,
}

func (ValidateEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return validateRootCodes.codeFor(leaf)
}

var validationErrorsCodes = map[DiagSlot]string{
	SlotNonSerializableRoot:        diagnostics.CodeVENonSerializableRoot,
	SlotFunctionPropDropped:        diagnostics.CodeVEFunctionPropDropped,
	SlotMethodDropped:              diagnostics.CodeVEMethodDropped,
	SlotStaticDropped:              diagnostics.CodeVEStaticDropped,
	SlotSymbolKeyedDropped:         diagnostics.CodeVESymbolKeyedDropped,
	SlotNonSerializablePropDropped: diagnostics.CodeVENonSerializablePropDrop,
	SlotRootAnyUnknown:             diagnostics.CodeVERootAnyUnknown,
}

func (ValidationErrorsEmitter) DiagCodeFor(slot DiagSlot) string { return validationErrorsCodes[slot] }

var validationErrorsRootCodes = rootCodeMap{
	never:           "",
	nonSerializable: diagnostics.CodeVENonSerializableRoot,
	function:        "",
	symbol:          diagnostics.CodeVESymbolRoot,
}

func (ValidationErrorsEmitter) DiagCodeForLeaf(leaf *protocol.RunType) string {
	return validationErrorsRootCodes.codeFor(leaf)
}

var hasUnknownKeysCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diagnostics.CodeHUKFunctionPropDropped,
}

func (HasUnknownKeysEmitter) DiagCodeFor(slot DiagSlot) string { return hasUnknownKeysCodes[slot] }

var stripUnknownKeysCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diagnostics.CodeSUKFunctionPropDropped,
}

func (StripUnknownKeysEmitter) DiagCodeFor(slot DiagSlot) string { return stripUnknownKeysCodes[slot] }

var unknownKeyErrorsCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diagnostics.CodeUKEFunctionPropDropped,
}

func (UnknownKeyErrorsEmitter) DiagCodeFor(slot DiagSlot) string { return unknownKeyErrorsCodes[slot] }

var unknownKeysToUndefinedCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diagnostics.CodeUKUFunctionPropDropped,
}

func (UnknownKeysToUndefinedEmitter) DiagCodeFor(slot DiagSlot) string {
	return unknownKeysToUndefinedCodes[slot]
}

var unknownKeysToUndefinedWireCodes = map[DiagSlot]string{
	SlotFunctionPropDropped: diagnostics.CodeUKWFunctionPropDropped,
}

func (UnknownKeysToUndefinedWireEmitter) DiagCodeFor(slot DiagSlot) string {
	return unknownKeysToUndefinedWireCodes[slot]
}
