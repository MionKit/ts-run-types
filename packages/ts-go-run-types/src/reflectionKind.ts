// Numeric kind discriminators mirroring `internal/protocol/protocol.go` —
// the Go binary emits these as integer values into the `runTypesCache`
// factory calls (`rt(id, kind, …)`), so JS-side consumers dispatch on
// the same numeric values. Keep in lockstep with `ReflectionKind` /
// `ReflectionSubKind` declared in protocol.go and subkind.go.

export const RunTypeKind = {
  never: 0,
  any: 1,
  unknown: 2,
  void: 3,
  object: 4,
  string: 5,
  number: 6,
  boolean: 7,
  symbol: 8,
  bigint: 9,
  null: 10,
  undefined: 11,
  regexp: 12,
  literal: 13,
  templateLiteral: 14,
  property: 15,
  method: 16,
  function: 17,
  parameter: 18,
  promise: 19,
  class: 20,
  typeParameter: 21,
  enum: 22,
  union: 23,
  intersection: 24,
  array: 25,
  tuple: 26,
  tupleMember: 27,
  enumMember: 28,
  rest: 29,
  objectLiteral: 30,
  indexSignature: 31,
  propertySignature: 32,
  methodSignature: 33,
  infer: 34,
  callSignature: 35,
  ref: -1,
} as const;

export type RunTypeKindName = keyof typeof RunTypeKind;
export type RunTypeKindValue = (typeof RunTypeKind)[RunTypeKindName];

export const RunTypeSubKind = {
  date: 2001,
  map: 2002,
  set: 2003,
  nonSerializable: 2004,
} as const;

export type RunTypeSubKindName = keyof typeof RunTypeSubKind;
export type RunTypeSubKindValue = (typeof RunTypeSubKind)[RunTypeSubKindName];
