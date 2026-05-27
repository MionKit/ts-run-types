package typefns

import "github.com/mionkit/ts-run-types/internal/diag"

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

var prepareForJsonSafePreserveCodes = map[DiagSlot]string{
	SlotNeverRoot:           diag.CodePJPNeverRoot,
	SlotNonSerializableRoot: diag.CodePJPNonSerializableRoot,
	SlotFunctionRoot:        diag.CodePJPFunctionRoot,
	SlotArrayElement:        diag.CodePJPArrayElement,
	SlotFunctionPropDropped: diag.CodePJPFunctionPropDropped,
	SlotMethodDropped:       diag.CodePJPMethodDropped,
	SlotStaticDropped:       diag.CodePJPStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodePJPSymbolKeyedDropped,
}

func (PrepareForJsonSafePreserveEmitter) DiagCodeFor(slot DiagSlot) string {
	return prepareForJsonSafePreserveCodes[slot]
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

var isTypeCodes = map[DiagSlot]string{
	SlotNonSerializableRoot: diag.CodeISNonSerializableRoot,
	SlotFunctionPropDropped: diag.CodeISFunctionPropDropped,
	SlotMethodDropped:       diag.CodeISMethodDropped,
	SlotStaticDropped:       diag.CodeISStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodeISSymbolKeyedDropped,
}

func (IsTypeEmitter) DiagCodeFor(slot DiagSlot) string { return isTypeCodes[slot] }

var typeErrorsCodes = map[DiagSlot]string{
	SlotNonSerializableRoot: diag.CodeTENonSerializableRoot,
	SlotFunctionPropDropped: diag.CodeTEFunctionPropDropped,
	SlotMethodDropped:       diag.CodeTEMethodDropped,
	SlotStaticDropped:       diag.CodeTEStaticDropped,
	SlotSymbolKeyedDropped:  diag.CodeTESymbolKeyedDropped,
	SlotRootAnyUnknown:      diag.CodeTERootAnyUnknown,
}

func (TypeErrorsEmitter) DiagCodeFor(slot DiagSlot) string { return typeErrorsCodes[slot] }

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
