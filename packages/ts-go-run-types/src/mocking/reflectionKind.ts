// Numeric kind discriminators mirroring `internal/protocol/protocol.go` —
// the Go binary emits these as integer values into the `runTypesCache`
// factory calls (`rt(id, kind, …)`), so the JS-side walker dispatches on
// the same numeric values. Keep in lockstep with `ReflectionKind` /
// `ReflectionSubKind` declared in protocol.go and subkind.go.

export const KIND_NEVER = 0;
export const KIND_ANY = 1;
export const KIND_UNKNOWN = 2;
export const KIND_VOID = 3;
export const KIND_OBJECT = 4;
export const KIND_STRING = 5;
export const KIND_NUMBER = 6;
export const KIND_BOOLEAN = 7;
export const KIND_SYMBOL = 8;
export const KIND_BIGINT = 9;
export const KIND_NULL = 10;
export const KIND_UNDEFINED = 11;
export const KIND_REGEXP = 12;
export const KIND_LITERAL = 13;
export const KIND_TEMPLATE_LITERAL = 14;
export const KIND_PROPERTY = 15;
export const KIND_METHOD = 16;
export const KIND_FUNCTION = 17;
export const KIND_PARAMETER = 18;
export const KIND_PROMISE = 19;
export const KIND_CLASS = 20;
export const KIND_TYPE_PARAMETER = 21;
export const KIND_ENUM = 22;
export const KIND_UNION = 23;
export const KIND_INTERSECTION = 24;
export const KIND_ARRAY = 25;
export const KIND_TUPLE = 26;
export const KIND_TUPLE_MEMBER = 27;
export const KIND_ENUM_MEMBER = 28;
export const KIND_REST = 29;
export const KIND_OBJECT_LITERAL = 30;
export const KIND_INDEX_SIGNATURE = 31;
export const KIND_PROPERTY_SIGNATURE = 32;
export const KIND_METHOD_SIGNATURE = 33;
export const KIND_INFER = 34;
export const KIND_CALL_SIGNATURE = 35;

export const KIND_REF = -1;

export const SUB_KIND_DATE = 2001;
export const SUB_KIND_MAP = 2002;
export const SUB_KIND_SET = 2003;
export const SUB_KIND_NON_SERIALIZABLE = 2004;
