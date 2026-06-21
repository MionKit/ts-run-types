// The build functions the playground offers. `factory` is the ts-runtypes
// export; `fnKey` matches the marker overlay. `kind` selects how the engine
// invokes it and how the result is shaped.

export type OperationKind = 'predicate' | 'errors' | 'encode' | 'jsonRoundtrip' | 'binaryEncode' | 'binaryRoundtrip' | 'graph';

export interface Operation {
  key: string;
  factory: string;
  fnKey: string | null;
  kind: OperationKind;
  label: string;
  blurb: string;
  needsInput: boolean;
}

export const OPERATIONS: readonly Operation[] = [
  {
    key: 'validate',
    factory: 'createValidate',
    fnKey: 'val',
    kind: 'predicate',
    label: 'createValidate',
    blurb: 'Type guard: returns true when the value matches the type.',
    needsInput: true,
  },
  {
    key: 'errors',
    factory: 'createGetValidationErrors',
    fnKey: 'verr',
    kind: 'errors',
    label: 'createGetValidationErrors',
    blurb: 'Returns the list of validation errors (empty when valid).',
    needsInput: true,
  },
  {
    key: 'jsonEncoder',
    factory: 'createJsonEncoder',
    fnKey: 'jsonEncoder',
    kind: 'encode',
    label: 'createJsonEncoder',
    blurb: 'Encodes a value into its JSON-safe shape.',
    needsInput: true,
  },
  {
    key: 'jsonDecoder',
    factory: 'createJsonDecoder',
    fnKey: 'jsonDecoder',
    kind: 'jsonRoundtrip',
    label: 'createJsonDecoder',
    blurb: 'Decodes JSON back into the data type (encodes your input first, then decodes it).',
    needsInput: true,
  },
  {
    key: 'binaryEncoder',
    factory: 'createBinaryEncoder',
    fnKey: 'tb',
    kind: 'binaryEncode',
    label: 'createBinaryEncoder',
    blurb: 'Encodes a value into a compact binary buffer (shown as hex).',
    needsInput: true,
  },
  {
    key: 'binaryDecoder',
    factory: 'createBinaryDecoder',
    fnKey: 'fb',
    kind: 'binaryRoundtrip',
    label: 'createBinaryDecoder',
    blurb: 'Decodes a binary buffer back into the data type (encodes your input first, then decodes it).',
    needsInput: true,
  },
  {
    key: 'graph',
    factory: 'getRunTypeId',
    fnKey: null,
    kind: 'graph',
    label: 'getRunType',
    blurb: 'Resolves the type to its RunType (the reflection graph RunTypes generates), shown on the right.',
    needsInput: false,
  },
];

export function operationByKey(key: string): Operation {
  return OPERATIONS.find((op) => op.key === key) ?? OPERATIONS[0];
}
