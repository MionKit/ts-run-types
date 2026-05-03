// Wire types mirroring internal/protocol/protocol.go. Hand-maintained rather
// than code-generated to keep the plugin dep-free.
//
// The shape mirrors deepkit/type's `Type` discriminated union — see
// https://github.com/marcj/deepkit/blob/master/packages/type/src/reflection/type.ts.
// Child Type slots in the JSON wire format are sentinels (`{kind: -1, id: N}`);
// consumers either re-knot themselves (raw JSON) or import the generated
// runtypes-cache.ts module which contains a fully-knotted graph.

export enum ReflectionKind {
  never = 0,
  any = 1,
  unknown = 2,
  void = 3,
  object = 4,
  string = 5,
  number = 6,
  boolean = 7,
  symbol = 8,
  bigint = 9,
  null = 10,
  undefined = 11,
  regexp = 12,
  literal = 13,
  templateLiteral = 14,
  property = 15,
  method = 16,
  function = 17,
  parameter = 18,
  promise = 19,
  class = 20,
  typeParameter = 21,
  enum = 22,
  union = 23,
  intersection = 24,
  array = 25,
  tuple = 26,
  tupleMember = 27,
  enumMember = 28,
  rest = 29,
  objectLiteral = 30,
  indexSignature = 31,
  propertySignature = 32,
  methodSignature = 33,
  infer = 34,
  callSignature = 35,
}

// kindRef is our sentinel — not a deepkit kind. Used in JSON to point at
// another type by id without inlining the referenced node.
export const KIND_REF = -1;

export interface ClassRef {
  name: string;
  module?: string;
}

// Type is a JSON-friendly union of every deepkit Type variant. Optional
// fields are populated only when relevant to the discriminator `kind`.
export interface Type {
  id?: number;
  kind: ReflectionKind | typeof KIND_REF;

  // TypeAnnotations
  typeName?: string;
  typeArguments?: Type[];
  inlined?: true;

  // TypeLiteral
  literal?: unknown;

  // TypeNumber.brand (v2)
  brand?: number;

  // shared
  name?: string;
  optional?: true;
  readonly?: true;
  visibility?: number;
  abstract?: true;
  static?: true;
  default?: unknown;
  description?: string;
  flags?: string[];

  // function-like
  parameters?: Type[];
  return?: Type;

  // single-typed containers (array/promise/tupleMember/property/parameter)
  type?: Type;
  index?: Type;

  // multi-typed containers (objectLiteral/class/tuple/union/intersection/enum)
  types?: Type[];

  // enum
  enum?: Record<string, unknown>;
  values?: unknown[];
  indexType?: Type;

  // class
  extendsArguments?: Type[];
  implements?: Type[];
  arguments?: Type[];
  classRef?: ClassRef;
}

export interface Site {
  file: string;
  pos: number;
  id: number;
}

export interface Request {
  op:
    | "resolveAnnotation"
    | "resolveTypeArgument"
    | "resolveArgumentInferred"
    | "resolveSymbol"
    | "dump";
  file?: string;
  pos?: number;
  callPos?: number;
  index?: number;
}

export interface Response {
  id?: number;
  added?: Type[];
  sites?: Site[];
  types?: Type[];
  error?: string;
}

export interface Dump {
  types: Type[];
  sites: Site[];
}
