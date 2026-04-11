// Wire types mirroring internal/protocol/protocol.go. Hand-maintained rather
// than code-generated to keep the plugin dep-free.

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

export type Kind =
  | "primitive"
  | "literal"
  | "object"
  | "function"
  | "union"
  | "intersection"
  | "array"
  | "tuple"
  | "enum"
  | "any"
  | "unknown"
  | "never"
  | "void"
  | "null"
  | "undefined";

export interface Property {
  type: string;
  optional?: boolean;
  readonly?: boolean;
}

export interface Parameter {
  name: string;
  type: string;
  optional?: boolean;
  rest?: boolean;
}

export interface Signature {
  parameters: Parameter[];
  return: string;
}

export interface TypeNode {
  id: string;
  kind: Kind;
  name?: string;
  alias?: string;
  literal?: unknown;
  properties?: Record<string, Property>;
  parameters?: Parameter[];
  return?: string;
  members?: string[];
  itemType?: string;
  elements?: string[];
  signatures?: Signature[];
  flags?: string[];
}

export interface Site {
  file: string;
  pos: number;
  id: string;
}

export interface Response {
  id?: string;
  added?: TypeNode[];
  sites?: Site[];
  types?: TypeNode[];
  error?: string;
}

export interface Dump {
  types: TypeNode[];
  sites: Site[];
}
