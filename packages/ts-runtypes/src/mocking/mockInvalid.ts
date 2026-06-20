// Negative ("invalid") mock generation — the `invalid` mock option. Generates a
// normal valid mock, then walks the RunType graph alongside that value and
// replaces ONE position with a value the type rejects: the inverse of what the
// mock would produce there (a number for a string, a value outside a union, a
// non-string for a regexp / formatted string, an object where a primitive is
// required, …). `invalidLeafProbability` biases WHERE the break lands — 1 always
// a deep leaf, 0 always the whole root.
//
// Type-accurate by construction (it reads each node's kind / literal / union
// members), so the corrupted position fails `validate<T>` without needing to run
// the validator. The only positions it cannot make invalid are `any` / `unknown`
// (nothing fails them); those are left untouched and the corruption lands
// elsewhere when one is available.

import {RunTypeKind} from '../runTypeKind.ts';
import type {RunType} from '../runtypes/types.ts';
import type {MockOptions, RunTypeMockOptions} from './mockTypes.ts';
import {mockRunType} from './mockType.ts';

const K = RunTypeKind;

const kindOf = (node: RunType): number => node.kind as number;

interface Target {
  parent: Record<string | number, unknown>;
  key: string | number;
  node: RunType | undefined;
  value: unknown;
  isLeaf: boolean;
}

// Containers we recurse into. Date / typed arrays / Map / Set / RegExp are opaque
// leaves (corrupted whole, never descended); plain objects and arrays descend.
function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  if (typeof value !== 'object' || value === null) return false;
  if (Array.isArray(value)) return true;
  return !(
    value instanceof Date ||
    value instanceof Uint8Array ||
    value instanceof Map ||
    value instanceof Set ||
    value instanceof RegExp
  );
}

// Does `node` accept a value of `candidate`'s runtime shape? Used both to pick the
// in-play arm of a union (for descent) and to find a type no union member accepts.
function kindMatchesValue(node: RunType, candidate: unknown): boolean {
  switch (kindOf(node)) {
    case K.string:
    case K.regexp:
    case K.templateLiteral:
      return typeof candidate === 'string';
    case K.number:
      return typeof candidate === 'number';
    case K.bigint:
      return typeof candidate === 'bigint';
    case K.boolean:
      return typeof candidate === 'boolean';
    case K.literal:
      return candidate === node.literal;
    case K.null:
      return candidate === null;
    case K.undefined:
    case K.void:
      return candidate === undefined;
    case K.array:
    case K.tuple:
      return Array.isArray(candidate);
    case K.object:
    case K.objectLiteral:
    case K.intersection:
    case K.class:
      return typeof candidate === 'object' && candidate !== null && !Array.isArray(candidate);
    case K.enum:
      return true;
    default:
      return false;
  }
}

// Resolve a union to the member matching `value` (best effort) so descent finds
// the right children; pass other kinds through unchanged.
function memberForValue(node: RunType | undefined, value: unknown): RunType | undefined {
  if (!node || kindOf(node) !== K.union) return node;
  const members = (node.children ?? []).filter((member) => !member.notSupported);
  return members.find((member) => kindMatchesValue(member, value)) ?? members[0] ?? node;
}

// The node describing `obj[key]`, walking object / intersection members (and
// falling back to an index signature). Undefined when not found.
function propChildNode(node: RunType | undefined, key: string | number): RunType | undefined {
  const children = node?.children ?? [];
  for (const member of children) {
    if ((kindOf(member) === K.property || kindOf(member) === K.propertySignature) && member.name === String(key)) {
      return member.child;
    }
  }
  for (const member of children) {
    if (kindOf(member) === K.indexSignature) return member.child;
  }
  return undefined;
}

// The node describing element `i` of an array / tuple value.
function elemNodeAt(node: RunType | undefined, i: number): RunType | undefined {
  if (!node) return undefined;
  if (kindOf(node) === K.tuple) {
    const member = (node.children ?? [])[i];
    return member?.child ?? member;
  }
  return node.child;
}

// A runtime-type inverse used when no graph node is available: a value whose
// typeof differs from `value`'s.
function typeofInverse(value: unknown): unknown {
  if (typeof value === 'string') return 123;
  if (typeof value === 'number' || typeof value === 'bigint') return 'not-a-number';
  if (typeof value === 'boolean') return 'not-a-boolean';
  if (value === null || value === undefined) return 'unexpected';
  if (Array.isArray(value)) return 'not-an-array';
  return 'not-an-object';
}

// Candidate values spanning the runtime types; negativeForUnion returns the first
// one no member of the union accepts.
const UNION_CANDIDATES: readonly unknown[] = ['rt-invalid', 1234.5, true, {rtInvalid: true}, [], null];

// A value outside the whole union (rejected by every member). Falls back to a
// runtime-type inverse for a union that somehow accepts all candidate shapes.
function negativeForUnion(members: RunType[], value: unknown): unknown {
  const live = members.filter((member) => !member.notSupported);
  for (const candidate of UNION_CANDIDATES) {
    if (!live.some((member) => kindMatchesValue(member, candidate))) return candidate;
  }
  return typeofInverse(value);
}

// A value != `lit` and of a different type, so a literal node rejects it.
function literalInverse(lit: unknown): unknown {
  if (typeof lit === 'string') return 1;
  return 'not-the-literal';
}

// negativeFor produces a value that should FAIL validation for `node` — the
// per-kind switch. Falls back to a runtime-type inverse for kinds with no
// specific rule (or a missing node).
export function negativeFor(node: RunType | undefined, value: unknown): unknown {
  if (!node) return typeofInverse(value);
  const kind = kindOf(node);
  if (kind === K.union) return negativeForUnion(node.children ?? [], value);
  switch (kind) {
    case K.string:
    case K.regexp:
    case K.templateLiteral:
    case K.symbol:
      return 123; // not a string
    case K.number:
    case K.bigint:
      return 'not-a-number';
    case K.boolean:
      return 'not-a-boolean';
    case K.literal:
      return literalInverse(node.literal);
    case K.enum:
      return {}; // not a valid enum primitive
    case K.null:
      return 'not-null';
    case K.undefined:
    case K.void:
      return 'should-be-undefined';
    case K.object:
    case K.objectLiteral:
    case K.intersection:
    case K.class:
      return 'not-an-object';
    case K.array:
    case K.tuple:
      return 'not-an-array';
    case K.any:
    case K.unknown:
      return value; // nothing fails `any` — leave it; the break lands elsewhere
    default:
      return typeofInverse(value);
  }
}

// Co-walk a container value with its (union-resolved) node, recording every
// descendant position as a corruption target. Leaves keep their ORIGINAL node
// (which may be a union) so negativeFor can pick a value outside it.
function collectChildren(container: Record<string, unknown> | unknown[], node: RunType | undefined, out: Target[]): void {
  if (Array.isArray(container)) {
    const arr = container as unknown as Record<string | number, unknown>;
    container.forEach((value, index) => visit(value, elemNodeAt(node, index), arr, index, out));
    return;
  }
  for (const key of Object.keys(container)) {
    visit(container[key], propChildNode(node, key), container, key, out);
  }
}

function visit(
  value: unknown,
  node: RunType | undefined,
  parent: Record<string | number, unknown>,
  key: string | number,
  out: Target[]
): void {
  if (isContainer(value)) {
    out.push({parent, key, node, value, isLeaf: false});
    collectChildren(value, memberForValue(node, value), out);
  } else {
    out.push({parent, key, node, value, isLeaf: true});
  }
}

// injectInvalid mutates `root` so it should fail validation: with probability
// `invalidLeafProbability` (and when leaves exist) it corrupts a random deep
// leaf; otherwise it replaces the whole root. Returns the (possibly replaced)
// value.
function injectInvalid(root: unknown, rootNode: RunType | undefined, invalidLeafProbability: number): unknown {
  if (isContainer(root)) {
    const targets: Target[] = [];
    collectChildren(root, memberForValue(rootNode, root), targets);
    const leaves = targets.filter((target) => target.isLeaf);
    if (leaves.length > 0 && Math.random() < invalidLeafProbability) {
      const chosen = leaves[Math.floor(Math.random() * leaves.length)];
      chosen.parent[chosen.key] = negativeFor(chosen.node, chosen.value);
      return root;
    }
  }
  return negativeFor(rootNode, root);
}

// mockRunTypeInvalid is the `invalid` counterpart of mockRunType: a fresh valid
// mock with one type-aware position corrupted (see injectInvalid).
export function mockRunTypeInvalid(runType: RunType, options: RunTypeMockOptions, stack: RunType[] = []): unknown {
  const base = mockRunType(runType, options, stack);
  const mockOptions = options.mock as MockOptions;
  return injectInvalid(base, runType, mockOptions.invalidLeafProbability ?? 0.85);
}
