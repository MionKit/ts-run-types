// Type-aware "negative" value generator for the playground's "Random invalid"
// button. It reuses the real createMockType output as a valid base, then walks
// the type's RunType graph alongside that value and replaces ONE position with a
// value the type rejects — the inverse of what the mock generator would produce
// there (a string field gets a number, a `'a' | 'b'` union gets a number, an
// object gets a string, …). For string-family nodes (string, regexp, template
// literal, formatted strings) the reliable break is simply "not a string".
//
// `leafProbability` (0–1) biases WHERE the break lands: 1 always corrupts a deep
// leaf (a single primitive), 0 always corrupts the root (the whole value); values
// between roll per call. The caller verifies the result against the real
// validator and retries, so the rare case where a corruption stays valid (a
// multi-type union arm, an `any`) is caught rather than shipped.

import {RunTypeKind} from 'ts-runtypes';
import type {RunTypeNode} from './engine.ts';

const K = RunTypeKind;

interface Target {
  parent: Record<string | number, unknown>;
  key: string | number;
  node: RunTypeNode | undefined;
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

// Does `node` describe a value of `value`'s runtime shape? Used to pick the
// in-play arm of a union so the corruption targets the type actually present.
function kindMatchesValue(node: RunTypeNode, value: unknown): boolean {
  switch (node.kind) {
    case K.string:
    case K.regexp:
    case K.templateLiteral:
      return typeof value === 'string';
    case K.number:
      return typeof value === 'number';
    case K.bigint:
      return typeof value === 'bigint';
    case K.boolean:
      return typeof value === 'boolean';
    case K.literal:
      return value === node.literal;
    case K.null:
      return value === null;
    case K.undefined:
    case K.void:
      return value === undefined;
    case K.array:
    case K.tuple:
      return Array.isArray(value);
    case K.object:
    case K.objectLiteral:
    case K.intersection:
    case K.class:
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    case K.enum:
      return true;
    default:
      return false;
  }
}

// Resolve a union to the member matching `value` (best effort); pass other kinds
// through unchanged.
function memberForValue(node: RunTypeNode | undefined, value: unknown): RunTypeNode | undefined {
  if (!node || node.kind !== K.union) return node;
  const members = ((node.children as RunTypeNode[] | undefined) ?? []).filter((m) => !m.notSupported);
  return members.find((m) => kindMatchesValue(m, value)) ?? members[0] ?? node;
}

// The node describing `obj[key]`, walking object / intersection members (and
// falling back to an index signature). Returns undefined when it can't be found,
// in which case the negative falls back to a runtime-type inverse.
function propChildNode(node: RunTypeNode | undefined, key: string | number): RunTypeNode | undefined {
  const children = (node?.children as RunTypeNode[] | undefined) ?? [];
  for (const member of children) {
    if ((member.kind === K.property || member.kind === K.propertySignature) && member.name === String(key)) {
      return member.child as RunTypeNode | undefined;
    }
  }
  for (const member of children) {
    if (member.kind === K.indexSignature) return member.child as RunTypeNode | undefined;
  }
  return undefined;
}

// The node describing element `i` of an array / tuple value.
function elemNodeAt(node: RunTypeNode | undefined, i: number): RunTypeNode | undefined {
  if (!node) return undefined;
  if (node.kind === K.tuple) {
    const member = ((node.children as RunTypeNode[] | undefined) ?? [])[i];
    return (member?.child as RunTypeNode | undefined) ?? member;
  }
  return node.child as RunTypeNode | undefined;
}

// Co-walk a container value with its (union-resolved) node, recording every
// descendant position as a corruption target (leaves and nested containers).
function collectChildren(container: Record<string, unknown> | unknown[], node: RunTypeNode | undefined, out: Target[]): void {
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
  node: RunTypeNode | undefined,
  parent: Record<string | number, unknown>,
  key: string | number,
  out: Target[]
): void {
  const resolved = memberForValue(node, value);
  if (isContainer(value)) {
    out.push({parent, key, node: resolved, value, isLeaf: false});
    collectChildren(value, resolved, out);
  } else {
    out.push({parent, key, node: resolved, value, isLeaf: true});
  }
}

// A runtime-type inverse used when no graph node is available (union miss, graph
// absent): a value whose typeof differs from `value`'s.
function typeofInverse(value: unknown): unknown {
  if (typeof value === 'string') return 123;
  if (typeof value === 'number' || typeof value === 'bigint') return 'not-a-number';
  if (typeof value === 'boolean') return 'not-a-boolean';
  if (value === null || value === undefined) return 'unexpected';
  if (Array.isArray(value)) return 'not-an-array';
  return 'not-an-object';
}

// A value != `lit` and of a different type, so a literal node rejects it.
function literalInverse(lit: unknown): unknown {
  if (typeof lit === 'string') return 1;
  return 'not-the-literal';
}

// negativeFor produces a value that should FAIL validation for `node` — the
// big switch over RunType kinds. Falls back to a runtime-type inverse for kinds
// it has no specific rule for (or when the node is missing).
export function negativeFor(node: RunTypeNode | undefined, value: unknown): unknown {
  const eff = memberForValue(node, value);
  if (!eff) return typeofInverse(value);
  switch (eff.kind) {
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
      return literalInverse(eff.literal);
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
      return value; // nothing fails `any` — leave it so the verify loop retries
    default:
      return typeofInverse(value);
  }
}

// injectNegative mutates `root` so it should fail validation: with probability
// `leafProbability` (and when leaves exist) it corrupts a random deep leaf;
// otherwise it replaces the whole root. Returns the (possibly replaced) value.
export function injectNegative(root: unknown, rootNode: RunTypeNode | undefined, leafProbability: number): unknown {
  if (isContainer(root)) {
    const targets: Target[] = [];
    collectChildren(root, memberForValue(rootNode, root), targets);
    const leaves = targets.filter((t) => t.isLeaf);
    if (leaves.length > 0 && Math.random() < leafProbability) {
      const chosen = leaves[Math.floor(Math.random() * leaves.length)];
      chosen.parent[chosen.key] = negativeFor(chosen.node, chosen.value);
      return root;
    }
  }
  return negativeFor(rootNode, root);
}
