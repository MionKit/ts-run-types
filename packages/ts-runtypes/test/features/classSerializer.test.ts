// Custom class serializer/deserializer registry adapter.
//
// Verifies the redesigned `registerClassSerializer(cls, handler?)` surface: the
// client hands over the CLASS (no name string, no namespace), `serialize` is
// optional (default: structural, same as any interface), and `deserialize` is
// optional for a zero-arg class (default: `Object.assign(new cls(), data)`).
// A registered class rebuilds a REAL instance (`instanceof`, methods live) in
// BOTH the JSON (createJsonEncoder / createJsonDecoder, default options) and
// binary (createBinaryEncoder / createBinaryDecoder) families; an UNREGISTERED
// class round-trips structurally to a plain object (no throw).
//
// The registry is keyed by the class's TYPE ID (the plugin injects the trailing
// InjectRunTypeId slot from the `new () => T` constructor param), so it matches
// the emitted `utl.getClassSerializer(<rt.ID>)` lookup and is minification-safe.
//
// Pairing rule (CLAUDE.md): static form `createXxx<Foo>()` and reflect form
// `createXxx(value)` are exercised as distinct cases; both resolve to the same
// cache entry for equivalent T, so a serializer registered once for the class
// serves both.

import {afterEach, describe, expect, it} from 'vitest';
import {
  createJsonEncoder,
  createJsonDecoder,
  createBinaryEncoder,
  createBinaryDecoder,
  registerClassSerializer,
  getRunTypeId,
} from 'ts-runtypes';
// Registry isolation helpers live next to the registry; not part of the
// public barrel (tests reach in directly).
import {
  clearClassSerializers,
  unregisterClassSerializer,
  getClassSerializer,
  isClassSerializerRegistered,
} from '../../src/runtypes/classSerializerRegistry.ts';

// ############################################################################
// Custom serialize + deserialize — the full-control path, new signature.
// ############################################################################

// A class with a non-empty constructor. `serialize` re-shapes the value within
// the declared property names (here it stores `amount` as a string), and
// `deserialize` rebuilds the instance. A custom `serialize` must stay within
// the declared object shape: the JSON decoder runs a structural pre-pass over
// the wire value, so a non-object / renamed-key custom shape is not supported
// on the JSON decode path (see docs/todos/class-serializer-custom-wire-shape.md).
class Money {
  constructor(
    public amount: number,
    public currency: string
  ) {}
  describe(): string {
    return `${this.amount} ${this.currency}`;
  }
}

function registerMoney(): void {
  registerClassSerializer(Money, {
    serialize: (m) => ({amount: String(m.amount), currency: m.currency}),
    deserialize: (data) => new Money(Number(data.amount), data.currency),
  });
}

afterEach(() => {
  clearClassSerializers();
});

describe('classSerializer / custom serialize + deserialize (JSON)', () => {
  it('static — createJsonEncoder<Money> / createJsonDecoder<Money> reconstruct a real Money', () => {
    registerMoney();
    const encode = createJsonEncoder<Money>();
    const decode = createJsonDecoder<Money>();

    const json = encode(new Money(4999, 'USD'));
    expect(typeof json).toBe('string');
    // The custom serialize arm ran: `amount` is on the wire as a STRING, which
    // the structural encode would never produce (it would keep the number).
    expect(json as string).toContain('"4999"');

    const decoded = decode(json as string) as Money;
    expect(decoded).toBeInstanceOf(Money);
    expect(decoded.amount).toBe(4999);
    expect(decoded.currency).toBe('USD');
    expect(decoded.describe()).toBe('4999 USD');
  });

  it('reflect — createJsonEncoder(value) / createJsonDecoder(value) reconstruct a real Money', () => {
    registerMoney();
    const sample = new Money(0, '');
    const encode = createJsonEncoder(sample);
    const decode = createJsonDecoder(sample);

    const decoded = decode(encode(new Money(150, 'EUR')) as string) as Money;
    expect(decoded).toBeInstanceOf(Money);
    expect(decoded.amount).toBe(150);
    expect(decoded.currency).toBe('EUR');
  });
});

describe('classSerializer / custom serialize + deserialize (binary)', () => {
  it('static — createBinaryEncoder<Money> / createBinaryDecoder<Money> reconstruct a real Money', () => {
    registerMoney();
    const encode = createBinaryEncoder<Money>();
    const decode = createBinaryDecoder<Money>();

    const decoded = decode(encode(new Money(99, 'GBP'))) as Money;
    expect(decoded).toBeInstanceOf(Money);
    expect(decoded.amount).toBe(99);
    expect(decoded.currency).toBe('GBP');
  });

  it('reflect — createBinaryEncoder(value) / createBinaryDecoder(value) reconstruct a real Money', () => {
    registerMoney();
    const sample = new Money(0, '');
    const decode = createBinaryDecoder(sample);
    const decoded = decode(createBinaryEncoder(sample)(new Money(-3, 'JPY'))) as Money;
    expect(decoded).toBeInstanceOf(Money);
    expect(decoded.amount).toBe(-3);
    expect(decoded.currency).toBe('JPY');
  });
});

// ############################################################################
// serialize OMITTED -> structural encode; deserialize still rebuilds.
// ############################################################################

// A class with a non-empty constructor but NO custom serialize: it encodes
// structurally (declared props), exactly like an interface of the same shape.
// `deserialize` is required by the overloads (non-empty constructor).
class Vec {
  constructor(
    public x: number,
    public y: number
  ) {}
  len(): number {
    return Math.hypot(this.x, this.y);
  }
}

function registerVec(): void {
  registerClassSerializer(Vec, {
    // no serialize -> structural
    deserialize: (data) => new Vec(data.x, data.y),
  });
}

describe('classSerializer / serialize omitted -> structural encode', () => {
  it('static (JSON) — structural payload (declared props, no rt$classID), decode rebuilds a real Vec', () => {
    registerVec();
    const encode = createJsonEncoder<Vec>();
    const decode = createJsonDecoder<Vec>();

    const json = encode(new Vec(3, 4)) as string;
    // Monomorphic position: the wire is the plain structural object, and it
    // carries NO synthetic rt$classID tag.
    const wire = JSON.parse(json);
    expect(wire).toEqual({x: 3, y: 4});
    expect('rt$classID' in wire).toBe(false);

    const decoded = decode(json) as Vec;
    expect(decoded).toBeInstanceOf(Vec);
    expect(decoded.len()).toBe(5);
  });

  it('reflect (JSON) — structural encode, decode rebuilds a real Vec', () => {
    registerVec();
    const sample = new Vec(0, 0);
    const decoded = createJsonDecoder(sample)(createJsonEncoder(sample)(new Vec(6, 8)) as string) as Vec;
    expect(decoded).toBeInstanceOf(Vec);
    expect(decoded.len()).toBe(10);
  });

  it('static (binary) — structural encode, decode rebuilds a real Vec', () => {
    registerVec();
    const decoded = createBinaryDecoder<Vec>()(createBinaryEncoder<Vec>()(new Vec(5, 12))) as Vec;
    expect(decoded).toBeInstanceOf(Vec);
    expect(decoded.len()).toBe(13);
  });

  it('reflect (binary) — structural encode, decode rebuilds a real Vec', () => {
    registerVec();
    const sample = new Vec(0, 0);
    const decoded = createBinaryDecoder(sample)(createBinaryEncoder(sample)(new Vec(8, 15))) as Vec;
    expect(decoded).toBeInstanceOf(Vec);
    expect(decoded.len()).toBe(17);
  });
});

// ############################################################################
// deserialize OMITTED for a zero-arg class -> auto `new cls()` + assign.
// ############################################################################

// A zero-arg class: the client literally just hands over the class. Both
// halves default (structural encode, auto-instantiate decode).
class Settings {
  theme = 'light';
  fontSize = 12;
  summary(): string {
    return `${this.theme}/${this.fontSize}`;
  }
}

describe('classSerializer / zero-arg class, nothing but the class', () => {
  it('static (JSON) — auto-instantiate: decoded value is instanceof Settings with methods live', () => {
    registerClassSerializer(Settings);
    const encode = createJsonEncoder<Settings>();
    const decode = createJsonDecoder<Settings>();

    const input = new Settings();
    input.theme = 'dark';
    input.fontSize = 16;

    const json = encode(input) as string;
    expect(JSON.parse(json)).toEqual({theme: 'dark', fontSize: 16});

    const decoded = decode(json) as Settings;
    expect(decoded).toBeInstanceOf(Settings);
    expect(decoded.theme).toBe('dark');
    expect(decoded.fontSize).toBe(16);
    expect(decoded.summary()).toBe('dark/16');
  });

  it('reflect (JSON) — auto-instantiate from a reflected sample', () => {
    registerClassSerializer(Settings);
    const sample = new Settings();
    const input = new Settings();
    input.theme = 'solarized';
    const decoded = createJsonDecoder(sample)(createJsonEncoder(sample)(input) as string) as Settings;
    expect(decoded).toBeInstanceOf(Settings);
    expect(decoded.theme).toBe('solarized');
    expect(decoded.summary()).toBe('solarized/12');
  });

  it('static (binary) — auto-instantiate through the binary family', () => {
    registerClassSerializer(Settings);
    const input = new Settings();
    input.fontSize = 20;
    const decoded = createBinaryDecoder<Settings>()(createBinaryEncoder<Settings>()(input)) as Settings;
    expect(decoded).toBeInstanceOf(Settings);
    expect(decoded.fontSize).toBe(20);
    expect(decoded.summary()).toBe('light/20');
  });

  it('reflect (binary) — auto-instantiate through the binary family', () => {
    registerClassSerializer(Settings);
    const sample = new Settings();
    const input = new Settings();
    input.theme = 'hc';
    const decoded = createBinaryDecoder(sample)(createBinaryEncoder(sample)(input)) as Settings;
    expect(decoded).toBeInstanceOf(Settings);
    expect(decoded.theme).toBe('hc');
  });
});

// ############################################################################
// Non-empty constructor without deserialize -> CLS002 at decode.
// ############################################################################

// A class TS sees as zero-arg (so the auto-instantiate overload accepts it),
// but whose constructor cannot run without real arguments. The auto
// `new cls()` throws, which `deserializeClass` surfaces as CLS002.
class Needy {
  value: number;
  constructor() {
    // Real code would read a required argument here; simulate the failure.
    throw new Error('Needy cannot be constructed without arguments');
  }
}

describe('classSerializer / auto-instantiate failure surfaces CLS002', () => {
  it('static (JSON) — decode throws a CLS002 message naming the class + fix', () => {
    registerClassSerializer(Needy);
    const encode = createJsonEncoder<Needy>();
    const decode = createJsonDecoder<Needy>();

    // Encode reads the structural props off a plain shape; no constructor call.
    const json = encode({value: 5} as unknown as Needy) as string;
    expect(JSON.parse(json)).toEqual({value: 5});

    expect(() => decode(json)).toThrow(/CLS002/);
    expect(() => decode(json)).toThrow(/Needy/);
    expect(() => decode(json)).toThrow(/deserialize/);
  });

  it('reflect (binary) — decode throws CLS002 through the binary family', () => {
    registerClassSerializer(Needy);
    const sample = {value: 0} as unknown as Needy;
    const buffer = createBinaryEncoder(sample)({value: 9} as unknown as Needy);
    expect(() => createBinaryDecoder(sample)(buffer)).toThrow(/CLS002/);
  });
});

// ############################################################################
// Unregistered class -> structural plain object (no throw).
// ############################################################################

describe('classSerializer / unregistered class falls back to structural plain object', () => {
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

    let json: string | undefined;
    expect(() => {
      json = encode(new Bar(5, 'five')) as string;
    }).not.toThrow();
    expect(JSON.parse(json as string)).toEqual({n: 5, tag: 'five'});

    const decoded = decode(json as string) as Bar;
    expect(decoded).not.toBeInstanceOf(Bar);
    expect(decoded.n).toBe(5);
    expect(decoded.tag).toBe('five');
    expect((decoded as {greet?: unknown}).greet).toBeUndefined();
  });

  it('binary — unregistered class round-trips structurally (no throw, props survive, not instanceof)', () => {
    const encode = createBinaryEncoder<Bar>();
    const decode = createBinaryDecoder<Bar>();

    let buffer: ReturnType<typeof encode>;
    expect(() => {
      buffer = encode(new Bar(8, 'eight'));
    }).not.toThrow();
    const decoded = decode(buffer!) as Bar;

    expect(decoded).not.toBeInstanceOf(Bar);
    expect(decoded.n).toBe(8);
    expect(decoded.tag).toBe('eight');
  });
});

// ############################################################################
// Registry isolation — clear / unregister / last-wins, new signature.
// ############################################################################

describe('classSerializer / registry isolation', () => {
  it('clearing the registry reverts a previously-registered class to structural fallback', () => {
    registerVec();
    clearClassSerializers();

    const decode = createJsonDecoder<Vec>();
    const decoded = decode(createJsonEncoder<Vec>()(new Vec(1, 1)) as string) as Vec;
    expect(decoded).not.toBeInstanceOf(Vec);
    expect(decoded.x).toBe(1);
    expect(decoded.y).toBe(1);
  });

  it('unregisterClassSerializer(cls) removes one entry, leaving others intact', () => {
    registerVec();
    registerClassSerializer(Settings);
    unregisterClassSerializer(Vec);

    const decoded = createJsonDecoder<Vec>()(createJsonEncoder<Vec>()(new Vec(2, 2)) as string) as Vec;
    expect(decoded).not.toBeInstanceOf(Vec);
    expect(decoded.x).toBe(2);
    // The untouched 'Settings' registration is still present.
    expect(isClassSerializerRegistered(Settings)).toBe(true);
    expect(isClassSerializerRegistered(Vec)).toBe(false);
  });

  it('re-registering the same class overwrites the prior handler (last wins)', () => {
    registerClassSerializer(Vec, {deserialize: (d) => new Vec(d.x + 100, d.y)});
    registerVec(); // overwrites with the plain round-tripping handler

    const decoded = createJsonDecoder<Vec>()(createJsonEncoder<Vec>()(new Vec(3, 7)) as string) as Vec;
    expect(decoded).toBeInstanceOf(Vec);
    expect(decoded.x).toBe(3);
  });

  it('is keyed by type id — the class node id resolves the entry', () => {
    // The registry is keyed by the injected type id, which equals getRunTypeId<T>().
    registerClassSerializer(Money, {deserialize: (d) => new Money(d.amount, d.currency)});
    expect(isClassSerializerRegistered(Money)).toBe(true);
    expect(getClassSerializer(getRunTypeId<Money>())?.cls).toBe(Money);
  });
});

// ############################################################################
// Nested + array positions: the registry branch is emitted wherever a plain
// user class node appears, not only at the root.
// ############################################################################

class Point {
  constructor(
    public x: number,
    public y: number
  ) {}
  mag(): number {
    return Math.hypot(this.x, this.y);
  }
}

interface Shape {
  name: string;
  origin: Point;
}

function registerPoint(): void {
  registerClassSerializer(Point, {
    deserialize: (data) => new Point(data.x, data.y),
  });
}

describe('classSerializer / nested class as an object property', () => {
  it('JSON — a registered class held as a property reconstructs a real instance', () => {
    registerPoint();
    const encode = createJsonEncoder<Shape>();
    const decode = createJsonDecoder<Shape>();

    const input: Shape = {name: 'box', origin: new Point(3, 4)};
    const decoded = decode(encode(input) as string) as Shape;
    expect(decoded.name).toBe('box');
    expect(decoded.origin).toBeInstanceOf(Point);
    expect(decoded.origin.mag()).toBe(5);
  });

  it('binary — a registered class held as a property reconstructs a real instance', () => {
    registerPoint();
    const encode = createBinaryEncoder<Shape>();
    const decode = createBinaryDecoder<Shape>();

    const input: Shape = {name: 'box', origin: new Point(6, 8)};
    const decoded = decode(encode(input)) as Shape;
    expect(decoded.name).toBe('box');
    expect(decoded.origin).toBeInstanceOf(Point);
    expect(decoded.origin.mag()).toBe(10);
  });
});

describe('classSerializer / class as an array element', () => {
  it('JSON — every registered class in an array reconstructs a real instance', () => {
    registerPoint();
    const decoded = createJsonDecoder<Point[]>()(createJsonEncoder<Point[]>()([new Point(1, 0), new Point(0, 1)]) as string);
    expect(decoded).toHaveLength(2);
    for (const point of decoded) expect(point).toBeInstanceOf(Point);
    expect(decoded[0].x).toBe(1);
    expect(decoded[1].y).toBe(1);
  });

  it('both codecs agree — JSON and binary reconstruct identical instances', () => {
    registerPoint();
    const input = [new Point(3, 4), new Point(5, 12)];
    // Decoders return `DataOnly<Point>[]` (mag() projected away); the registered
    // serializer rebuilds REAL Points, so cast back to exercise the method.
    const viaJson = createJsonDecoder<Point[]>()(createJsonEncoder<Point[]>()(input) as string) as Point[];
    const viaBinary = createBinaryDecoder<Point[]>()(createBinaryEncoder<Point[]>()(input)) as Point[];
    expect(viaBinary.map((p) => [p.x, p.y, p.mag()])).toEqual(viaJson.map((p) => [p.x, p.y, p.mag()]));
    for (const point of viaBinary) expect(point).toBeInstanceOf(Point);
  });
});
