// Custom class serializer/deserializer registry adapter (T7).
//
// Verifies that `registerClassSerializer(name, {serialize, deserialize})`
// routes a plain user class through the custom handler in BOTH the JSON
// (createJsonEncoder / createJsonDecoder, default options) and binary
// (createBinaryEncoder / createBinaryDecoder) families, reconstructing a
// REAL instance (`instanceof Foo`, props equal). An UNREGISTERED class
// round-trips structurally to a plain object (no throw).
//
// Marker-package test pattern: each factory thunk declares its class
// inline so the vite-plugin marker scanner sees the type and injects the
// runtype id; the class's symbol name is the registry key. The
// registry is registered/cleared per test to avoid cross-test leakage.
//
// Pairing rule (CLAUDE.md): static form `createXxx<Foo>()` and reflect
// form `createXxx(value)` are exercised as distinct cases; both resolve
// to the same cache entry for equivalent T, so a serializer registered
// once under the class name serves both.

import {afterEach, describe, expect, it} from 'vitest';
import {
  createJsonEncoder,
  createJsonDecoder,
  createBinaryEncoder,
  createBinaryDecoder,
  registerClassSerializer,
} from '@mionjs/ts-go-run-types';
// Registry isolation helpers live next to the registry; not part of the
// public barrel (tests reach in directly).
import {clearClassSerializers} from '../../src/runtypes/classSerializerRegistry.ts';

// A single class definition reused across thunks. Declaring it at module
// scope (not inside each thunk) keeps `instanceof` identity stable across
// encode + decode within a test, while the marker scanner still resolves
// `Foo` by its structural shape + name.
class Foo {
  constructor(
    public x: number,
    public label: string
  ) {}
  // A method to prove structural fallback drops it but the custom
  // deserializer restores a real instance that has it.
  describe(): string {
    return `${this.label}=${this.x}`;
  }
}

function registerFoo(): void {
  registerClassSerializer<Foo>('Foo', {
    serialize: (f) => ({x: f.x, label: f.label}),
    deserialize: (d) => {
      const data = d as {x: number; label: string};
      return new Foo(data.x, data.label);
    },
  });
}

afterEach(() => {
  clearClassSerializers();
});

describe('classSerializer / JSON round-trip (registered)', () => {
  it('static — createJsonEncoder<Foo> / createJsonDecoder<Foo> reconstruct a real Foo', () => {
    registerFoo();
    const encode = createJsonEncoder<Foo>();
    const decode = createJsonDecoder<Foo>();

    const input = new Foo(42, 'answer');
    const json = encode(input);
    // serialize() returned JSON-ready data; the pipeline stringified it.
    expect(typeof json).toBe('string');
    expect(JSON.parse(json as string)).toEqual({x: 42, label: 'answer'});

    const decoded = decode(json as string) as Foo;
    expect(decoded).toBeInstanceOf(Foo);
    expect(decoded.x).toBe(42);
    expect(decoded.label).toBe('answer');
    expect(decoded.describe()).toBe('answer=42');
  });

  it('reflect — createJsonEncoder(value) / createJsonDecoder(value) reconstruct a real Foo', () => {
    registerFoo();
    const sample = new Foo(0, '');
    const encode = createJsonEncoder(sample);
    const decode = createJsonDecoder(sample);

    const input = new Foo(7, 'seven');
    const json = encode(input);
    expect(JSON.parse(json as string)).toEqual({x: 7, label: 'seven'});

    const decoded = decode(json as string) as Foo;
    expect(decoded).toBeInstanceOf(Foo);
    expect(decoded.x).toBe(7);
    expect(decoded.label).toBe('seven');
  });
});

describe('classSerializer / binary round-trip (registered)', () => {
  it('static — createBinaryEncoder<Foo> / createBinaryDecoder<Foo> reconstruct a real Foo', () => {
    registerFoo();
    const encode = createBinaryEncoder<Foo>();
    const decode = createBinaryDecoder<Foo>();

    const input = new Foo(99, 'binary');
    const buffer = encode(input);
    const decoded = decode(buffer) as Foo;

    expect(decoded).toBeInstanceOf(Foo);
    expect(decoded.x).toBe(99);
    expect(decoded.label).toBe('binary');
    expect(decoded.describe()).toBe('binary=99');
  });

  it('reflect — createBinaryEncoder(value) / createBinaryDecoder(value) reconstruct a real Foo', () => {
    registerFoo();
    const sample = new Foo(0, '');
    const encode = createBinaryEncoder(sample);
    const decode = createBinaryDecoder(sample);

    const input = new Foo(-3, 'neg');
    const buffer = encode(input);
    const decoded = decode(buffer) as Foo;

    expect(decoded).toBeInstanceOf(Foo);
    expect(decoded.x).toBe(-3);
    expect(decoded.label).toBe('neg');
  });
});

describe('classSerializer / unregistered class falls back to structural plain object', () => {
  // A SECOND class, never registered. Its serialization must succeed
  // (warn + structural fallback, NOT a throw) and round-trip the declared
  // props to a prototype-less plain object.
  class Bar {
    constructor(
      public n: number,
      public tag: string
    ) {}
    greet(): string {
      return `hi ${this.tag}`;
    }
  }

  it('JSON — unregistered class round-trips structurally (no throw, props survive, not instanceof)', () => {
    const encode = createJsonEncoder<Bar>();
    const decode = createJsonDecoder<Bar>();

    const input = new Bar(5, 'five');
    let json: string | undefined;
    expect(() => {
      json = encode(input) as string;
    }).not.toThrow();
    expect(JSON.parse(json as string)).toEqual({n: 5, tag: 'five'});

    const decoded = decode(json as string) as Bar;
    expect(decoded).not.toBeInstanceOf(Bar);
    expect(decoded.n).toBe(5);
    expect(decoded.tag).toBe('five');
    // structural fallback drops the prototype, so no methods survive.
    expect((decoded as {greet?: unknown}).greet).toBeUndefined();
  });

  it('binary — unregistered class round-trips structurally (no throw, props survive, not instanceof)', () => {
    const encode = createBinaryEncoder<Bar>();
    const decode = createBinaryDecoder<Bar>();

    const input = new Bar(8, 'eight');
    let buffer: ReturnType<typeof encode>;
    expect(() => {
      buffer = encode(input);
    }).not.toThrow();
    const decoded = decode(buffer!) as Bar;

    expect(decoded).not.toBeInstanceOf(Bar);
    expect(decoded.n).toBe(8);
    expect(decoded.tag).toBe('eight');
  });
});

describe('classSerializer / registry isolation', () => {
  it('clearing the registry reverts a previously-registered class to structural fallback', () => {
    // Register, then clear: the decoder must NOT reconstruct an instance.
    registerFoo();
    clearClassSerializers();

    const encode = createJsonEncoder<Foo>();
    const decode = createJsonDecoder<Foo>();
    const json = encode(new Foo(1, 'one')) as string;
    expect(JSON.parse(json)).toEqual({x: 1, label: 'one'});

    const decoded = decode(json) as Foo;
    expect(decoded).not.toBeInstanceOf(Foo);
    expect(decoded.x).toBe(1);
    expect(decoded.label).toBe('one');
  });
});
