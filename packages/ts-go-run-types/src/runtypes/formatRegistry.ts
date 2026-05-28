// JS-side runtime registry of RunTypeFormat instances. Sibling of the
// Go-side `internal/compiled/typefns/formats/registry.go`; the two are
// kept in lock-step by convention — every concrete format ships a Go
// emitter AND a JS RunTypeFormat with matching `name`.
//
// The Go side handles JIT emit at build time (isType / typeErrors
// bodies inline the format's predicate directly). This JS-side
// registry exists for runtime-only paths that need the
// RunTypeFormat instance — mock generation, validation diagnostics
// requesting the human-readable format name, and any future
// reflection-driven use case.

import type {RunTypeKindValue} from '../runTypeKind.ts';
import type {FormatAnnotation} from './formatAnnotation.ts';

// BaseRunTypeFormat is the abstract surface every concrete format
// (StringRunTypeFormat, UUIDRunTypeFormat, …) extends. Subclasses
// live in `@mionjs/ts-go-type-formats`. The JIT-emit methods (mion
// has emitIsType / emitTypeErrors on this class) are intentionally
// absent here — they live in the Go binary now.
export abstract class BaseRunTypeFormat<Params extends Record<string, unknown> = Record<string, unknown>> {
  // Canonical format name. Matches the FormatAnnotation.name carried
  // on the wire. Must equal the name registered on the Go side.
  abstract readonly name: string;

  // Base reflection kind the format wraps. KindString for string
  // formats, KindNumber for number formats, etc. Registry uses this
  // as part of the lookup key to disambiguate formats that share a
  // name across kinds.
  abstract readonly kind: RunTypeKindValue;

  // _mock returns a randomly-generated value satisfying the format
  // constraints. Used by createMockType when it encounters a RunType
  // with this format annotation. Concrete implementations live in
  // ts-go-type-formats.
  abstract _mock(annotation: FormatAnnotation<Params>): unknown;

  // validateParams runs at format-registration / cache-build time
  // and throws when annotation.params can't be satisfied (e.g.
  // length < 0). Default no-op — overrides only when invariants
  // exist. Mirrors mion's BaseRunTypeFormat.validateParams.
  validateParams(_annotation: FormatAnnotation<Params>): void {
    // intentional no-op default
  }
}

interface RegistryKey {
  kind: RunTypeKindValue;
  name: string;
}

const registry = new Map<string, BaseRunTypeFormat>();

function key(entry: RegistryKey): string {
  return `${entry.kind}:${entry.name}`;
}

// registerFormatter adds a format instance to the runtime registry.
// Intended to be called from the module that defines each format
// (e.g. uuid.runtype.ts) at module load. Re-registering the same
// (kind, name) pair throws — drift between two implementations of
// the same format is a bug, not a fallback path.
export function registerFormatter(formatter: BaseRunTypeFormat): void {
  const lookupKey = key({kind: formatter.kind, name: formatter.name});
  if (registry.has(lookupKey)) {
    throw new Error(`registerFormatter: duplicate formatter for ${formatter.name}`);
  }
  registry.set(lookupKey, formatter);
}

// getFormatterFromCache returns the registered formatter for
// (kind, name), or undefined when no formatter exists. Missing
// entries are a graceful no-op — the runtime falls through to the
// kind-default behaviour, same forward-compat lever as the Go side.
export function getFormatterFromCache(kind: RunTypeKindValue, name: string): BaseRunTypeFormat | undefined {
  return registry.get(key({kind, name}));
}

// getRunTypeFormat is a convenience wrapper keyed off the
// FormatAnnotation directly. Returns undefined when annotation is
// missing or no formatter is registered.
export function getRunTypeFormat(
  kind: RunTypeKindValue,
  annotation: FormatAnnotation | undefined,
): BaseRunTypeFormat | undefined {
  if (!annotation) return undefined;
  return getFormatterFromCache(kind, annotation.name);
}
