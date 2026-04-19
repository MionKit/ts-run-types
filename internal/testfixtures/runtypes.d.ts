// Ambient declarations for the marker functions used by fixtures. The body
// does not matter — only the signature, because all resolution happens at
// build time via ts-run-types.
declare function getTypeInfo<T>(value: T): unknown;
declare function isType<T>(value: unknown): value is T;
declare function router<R extends Record<string, unknown>>(routes: R): R;
