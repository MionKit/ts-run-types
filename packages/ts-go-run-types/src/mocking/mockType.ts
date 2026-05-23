// Runtime mock-value generator. Walks a RunType graph and produces a value
// that passes `isType<T>` for the same `T`. Direct port of mion's mockType.ts.
//
// Unlike other RT families, mocking is NOT compiled per-type — the walker is
// a runtime interpreter over `runTypesCache`.
//
// Termination on cyclic types: `decayOptionsForNesting` divides
// `optionalProbability` and `maxRandomItemsLength` by the re-entry count, and
// `mockRunType` bails out with `undefined` past `maxMockRecursion` (default 10).

import type {MockOptions, RunTypeMockOptions} from './mockTypes.ts';
import type {RunType} from '../runtypes/types.ts';
import {RunTypeKind, RunTypeSubKind} from '../runTypeKind.ts';
import {
  mockAny,
  mockBigInt,
  mockBoolean,
  mockDate,
  mockNumber,
  mockRegExp,
  mockString,
  mockSymbol,
  random,
  randomItem,
} from './mockUtils.ts';
import {stringCharSet} from './constants.mock.ts';

/** Public entry. Tracks descent via `stack`, applies probability/length decay
 *  based on re-entry count (cycle detector via reference identity — the
 *  runTypes cache shares one object per cyclic ref), then dispatches. **/
export function mockRunType(runType: RunType, options: RunTypeMockOptions, stack: RunType[] = []): unknown {
  stack.push(runType);
  try {
    const baseMockOpts = options.mock as MockOptions;
    const nestLevel = countOccurrences(stack, runType);
    if (nestLevel > baseMockOpts.maxMockRecursion) return undefined;
    const decayed = nestLevel > 1 ? decayOptionsForNesting(options, nestLevel) : options;
    return mockSwitch(runType, decayed, stack);
  } finally {
    stack.pop();
  }
}

/** Count how many times `target` appears in `stack` by reference identity.
 *  Hand-rolled loop avoids `.filter().length` allocation on the hot path. **/
function countOccurrences(stack: RunType[], target: RunType): number {
  let count = 0;
  for (let i = 0; i < stack.length; i++) {
    if (stack[i] === target) count++;
  }
  return count;
}

/** Reduces optional-probability and item-length by nesting depth so cyclic
 *  types bottom out. Returns a shallow copy; inner pools are shared (they
 *  are read-only). Mirrors mion's `getMockOptionsForNestedElements`. **/
function decayOptionsForNesting(options: RunTypeMockOptions, nestLevel: number): RunTypeMockOptions {
  const mOps = options.mock as MockOptions;
  const maxDepth = mOps.maxMockRecursion;
  const divisor = nestLevel;
  const newProv = nestLevel >= maxDepth ? 0 : mOps.optionalProbability / divisor;
  const newMaxLength = nestLevel >= maxDepth ? 0 : Math.round(mOps.maxRandomItemsLength / divisor);
  const next: MockOptions = {
    ...mOps,
    optionalProbability: newProv,
    maxRandomItemsLength: newMaxLength,
  };
  if (mOps.optionalPropertyProbability) {
    // mion's source double-divides (clearly a typo); we port the intent:
    // value / divisor, matching the global `optionalProbability` decay.
    const entries = Object.entries(mOps.optionalPropertyProbability).map(([key, value]) => {
      const decayed = nestLevel > maxDepth ? 0 : value / divisor;
      return [key, decayed] as const;
    });
    next.optionalPropertyProbability = Object.fromEntries(entries);
  }
  if (mOps.arrayLength !== undefined) {
    next.arrayLength = nestLevel >= maxDepth ? 0 : Math.round(mOps.arrayLength / divisor);
  }
  if (mOps.parentObj) next.parentObj = {};
  return {...options, mock: next};
}

/** Per-kind dispatch. New kinds land here, NOT in helper files — the whole
 *  switch lives in one place. **/
function mockSwitch(runType: RunType, options: RunTypeMockOptions, stack: RunType[]): unknown {
  const mOps = options.mock as MockOptions;
  const kind = runType.kind as number;

  switch (kind) {
    case RunTypeKind.never:
      throw new Error('Cannot mock never type.');
    case RunTypeKind.any:
    case RunTypeKind.unknown:
      return mockAny(mOps.anyValuesList);
    case RunTypeKind.string:
      return mockString(mOps.stringLength ?? random(1, mOps.maxRandomStringLength), mOps.stringCharSet || stringCharSet);
    case RunTypeKind.number:
      return mockNumber(mOps.minNumber, mOps.maxNumber);
    case RunTypeKind.boolean:
      return mockBoolean();
    case RunTypeKind.bigint:
      return mockBigInt(mOps.minNumber, mOps.maxNumber);
    case RunTypeKind.null:
      return null;
    case RunTypeKind.undefined:
      return undefined;
    case RunTypeKind.void:
      return undefined;
    case RunTypeKind.regexp:
      return mockRegExp(mOps.regexpList);
    case RunTypeKind.symbol:
      return mockSymbol(mOps.symbolName, mOps.symbolLength, mOps.symbolCharSet);
    case RunTypeKind.literal:
      return runType.literal;
    case RunTypeKind.object:
      return randomItem(mOps.objectList);
    case RunTypeKind.enum: {
      const values = runType.values as unknown[];
      if (!Array.isArray(values) || values.length === 0) {
        throw new Error('Cannot mock enum without values.');
      }
      const index = mOps.enumIndex ?? random(0, values.length - 1);
      return values[index];
    }
    case RunTypeKind.enumMember:
      throw new Error('Mock enum member is not supported.');
    case RunTypeKind.class: {
      // Disambiguate via `subKind`. User-defined classes fall through to
      // the objectLiteral builder (isType matches structurally).
      const subKind = runType.subKind as number | undefined;
      if (subKind === RunTypeSubKind.date) return mockDate(mOps.minDate, mOps.maxDate);
      if (subKind === RunTypeSubKind.map) return mockMap(runType, options, stack);
      if (subKind === RunTypeSubKind.set) return mockSet(runType, options, stack);
      if (subKind === RunTypeSubKind.nonSerializable) {
        throw new Error('Mock is disabled for non-serializable types.');
      }
      return buildObjectLiteral(runType, options, stack, mOps);
    }
    case RunTypeKind.array: {
      const child = runType.child as RunType | undefined;
      if (!child) throw new Error('Cannot mock array: child runtype missing.');
      const length = mOps.arrayLength ?? random(0, mOps.maxRandomItemsLength);
      if (length === 0) return [];
      const items: unknown[] = [];
      for (let i = 0; i < length; i++) items.push(mockRunType(child, options, stack));
      return items;
    }
    case RunTypeKind.tuple: {
      const children = (runType.children ?? []) as RunType[];
      const perElemOptions = mOps.tupleOptions;
      const params = children.map((member, index) => {
        const childOpts = perElemOptions?.[index] ? mergeChildOptions(options, perElemOptions[index]) : options;
        return mockRunType(member, childOpts, stack);
      });
      // Flatten a trailing rest member into the tuple.
      const lastMember = children[children.length - 1];
      if (lastMember && isRestTupleMember(lastMember) && Array.isArray(params[params.length - 1])) {
        return [...params.slice(0, -1), ...(params[params.length - 1] as unknown[])];
      }
      return params;
    }
    case RunTypeKind.tupleMember:
    case RunTypeKind.parameter: {
      // Both check `optional` before recursing on `child`. Rest members
      // are flagged via the child's RunTypeKind.rest kind.
      const child = runType.child as RunType | undefined;
      if (!child) return undefined;
      if (runType.optional && !isRestTupleMember(runType)) {
        if (Math.random() > mOps.optionalProbability) return undefined;
      }
      return mockRunType(child, options, stack);
    }
    case RunTypeKind.rest: {
      const child = runType.child as RunType | undefined;
      if (!child) return [];
      const length = random(0, mOps.maxRandomItemsLength);
      const items: unknown[] = [];
      for (let i = 0; i < length; i++) items.push(mockRunType(child, options, stack));
      return items;
    }
    case RunTypeKind.objectLiteral:
    case RunTypeKind.intersection:
      return buildObjectLiteral(runType, options, stack, mOps);
    case RunTypeKind.property:
    case RunTypeKind.propertySignature: {
      const child = runType.child as RunType | undefined;
      if (!child) return undefined;
      const name = runType.name as string | number | undefined;
      const perPropProb = mOps.optionalPropertyProbability;
      const probability =
        perPropProb && name !== undefined && perPropProb[name] !== undefined ? perPropProb[name] : mOps.optionalProbability;
      if (probability < 0 || probability > 1) {
        throw new Error('optionalProbability must be between 0 and 1');
      }
      if (runType.optional && Math.random() > probability) return undefined;
      return mockRunType(child, options, stack);
    }
    case RunTypeKind.indexSignature: {
      const child = runType.child as RunType | undefined;
      const keyType = runType.index as RunType | undefined;
      if (!child || !keyType) return {};
      const length = random(0, mOps.maxRandomItemsLength);
      const parent: Record<string | number | symbol, unknown> = mOps.parentObj ?? {};
      const keyKind = keyType.kind as number;
      for (let i = 0; i < length; i++) {
        let propName: string | number | symbol;
        switch (keyKind) {
          case RunTypeKind.number:
            propName = i;
            break;
          case RunTypeKind.string:
            propName = `key${i}`;
            break;
          case RunTypeKind.symbol:
            propName = Symbol.for(`key${i}`);
            break;
          case RunTypeKind.templateLiteral: {
            // Retry on collision — narrow patterns like `id-${number}` can repeat.
            const buildKey = (): string => buildTemplateLiteralString(keyType, mOps);
            let candidate = buildKey();
            for (let attempt = 0; attempt < 5 && Object.prototype.hasOwnProperty.call(parent, candidate); attempt++) {
              candidate = buildKey();
            }
            propName = candidate;
            break;
          }
          default:
            throw new Error(`Invalid index signature key kind: ${keyKind}`);
        }
        parent[propName as string] = mockRunType(child, options, stack);
      }
      return parent;
    }
    case RunTypeKind.union: {
      const children = (runType.children ?? []) as RunType[];
      if (children.length === 0) throw new Error('Cannot mock union with no branches.');
      if (mOps.unionIndex !== undefined && (mOps.unionIndex < 0 || mOps.unionIndex >= children.length)) {
        throw new Error('unionIndex must be between 0 and the number of types in the union.');
      }
      const index = mOps.unionIndex ?? random(0, children.length - 1);
      return mockRunType(children[index], options, stack);
    }
    case RunTypeKind.templateLiteral:
      return buildTemplateLiteralString(runType, mOps);
    case RunTypeKind.promise: {
      const child = runType.child as RunType | undefined;
      const timeOut = mOps.promiseTimeOut || 0;
      const resolveInner = () => (child ? mockRunType(child, options, stack) : undefined);
      return new Promise((resolve, reject) => {
        const finish = () => {
          if (mOps.promiseReject) reject(mOps.promiseReject);
          else resolve(resolveInner());
        };
        if (timeOut > 0) setTimeout(finish, timeOut);
        else finish();
      });
    }
    case RunTypeKind.function:
    case RunTypeKind.callSignature:
    case RunTypeKind.method:
    case RunTypeKind.methodSignature:
      // The mock isn't expected to satisfy `isType<Function>` — function-typed
      // cases are marked `mockTypeExpect: 'skip'` in the test adapter.
      return undefined;
    default:
      throw new Error(`Cannot mock runType: kind ${kind} is not yet supported by the mock walker.`);
  }
}

/** Builds a plain object from an objectLiteral / intersection / user-class.
 *  Skips methods; collects index signatures into the same parent. **/
function buildObjectLiteral(
  runType: RunType,
  options: RunTypeMockOptions,
  stack: RunType[],
  mOps: MockOptions
): Record<string | number, unknown> {
  const children = (runType.children ?? []) as RunType[];
  const parent: Record<string | number, unknown> = mOps.parentObj ?? {};
  for (const member of children) {
    const memberKind = member.kind as number;
    if (memberKind === RunTypeKind.method || memberKind === RunTypeKind.methodSignature) continue;
    if (memberKind === RunTypeKind.indexSignature) {
      const indexed = mockRunType(member, options, stack);
      if (indexed && typeof indexed === 'object') Object.assign(parent, indexed);
      continue;
    }
    const name = member.name as string | number | undefined;
    if (name === undefined) continue;
    const value = mockRunType(member, options, stack);
    parent[name] = value;
  }
  return parent;
}

/** True iff `member` is a tuple/parameter wrapper around RunTypeKind.rest. **/
function isRestTupleMember(member: RunType): boolean {
  if (member.kind === RunTypeKind.rest) return true;
  const child = member.child as RunType | undefined;
  return child !== undefined && child.kind === RunTypeKind.rest;
}

/** Wrap per-element `MockOptions` into the bag shape `mockRunType` expects. **/
function mergeChildOptions(options: RunTypeMockOptions, childMock: MockOptions): RunTypeMockOptions {
  return {...options, mock: childMock};
}

/** Map mock builder. Key/value types live at `runType.arguments[i].child`
 *  (the wire stores them as KindParameter wrappers). **/
function mockMap(runType: RunType, options: RunTypeMockOptions, stack: RunType[]): Map<unknown, unknown> {
  const mOps = options.mock as MockOptions;
  const args = (runType.arguments ?? []) as RunType[];
  const keyType = args[0]?.child as RunType | undefined;
  const valueType = args[1]?.child as RunType | undefined;
  const result = new Map<unknown, unknown>();
  if (!keyType || !valueType) return result;
  const length = mOps.arrayLength ?? random(0, mOps.maxRandomItemsLength);
  for (let i = 0; i < length; i++) {
    const key = mockRunType(keyType, options, stack);
    const value = mockRunType(valueType, options, stack);
    result.set(key, value);
  }
  return result;
}

/** Set mock builder. Element type lives at `runType.arguments[0].child`. **/
function mockSet(runType: RunType, options: RunTypeMockOptions, stack: RunType[]): Set<unknown> {
  const mOps = options.mock as MockOptions;
  const args = (runType.arguments ?? []) as RunType[];
  const elementType = args[0]?.child as RunType | undefined;
  const result = new Set<unknown>();
  if (!elementType) return result;
  const length = mOps.arrayLength ?? random(0, mOps.maxRandomItemsLength);
  for (let i = 0; i < length; i++) result.add(mockRunType(elementType, options, stack));
  return result;
}

/** Render a template-literal runtype to a string satisfying its regex.
 *  Layout: `runType.literal.templateLiteral.{texts, placeholders}`. **/
function buildTemplateLiteralString(runType: RunType, mOps: MockOptions): string {
  const envelope = (runType.literal ?? null) as TemplateLiteralEnvelope | null;
  const layout = envelope?.templateLiteral;
  if (!layout || !Array.isArray(layout.texts)) return '';
  const texts = layout.texts;
  const placeholders = Array.isArray(layout.placeholders) ? layout.placeholders : [];
  let out = '';
  for (let i = 0; i < texts.length; i++) {
    out += texts[i];
    if (i < placeholders.length) {
      out += renderTemplateLiteralPlaceholder(placeholders[i], mOps);
    }
  }
  return out;
}

interface TemplateLiteralEnvelope {
  templateLiteral?: {
    texts?: string[];
    placeholders?: TemplateLiteralPlaceholder[];
  };
}

interface TemplateLiteralPlaceholder {
  kind?: number;
  literal?: unknown;
}

/** Render one placeholder span to a fragment satisfying the regex anchor. **/
function renderTemplateLiteralPlaceholder(span: TemplateLiteralPlaceholder, mOps: MockOptions): string {
  if (!span) return '';
  const kind = typeof span.kind === 'number' ? span.kind : -1;
  switch (kind) {
    case RunTypeKind.literal:
      return span.literal === undefined ? '' : String(span.literal);
    case RunTypeKind.number:
      return String(mockNumber(mOps.minNumber, mOps.maxNumber));
    case RunTypeKind.bigint:
      return String(mockBigInt(mOps.minNumber, mOps.maxNumber));
    case RunTypeKind.string:
    case RunTypeKind.any:
    case RunTypeKind.unknown:
      return mockString(mOps.stringLength ?? random(1, mOps.maxRandomStringLength), mOps.stringCharSet || stringCharSet);
    default:
      // Unknown kind — empty string so surrounding text segments still anchor.
      return '';
  }
}
