import {registerClassSerializer, createJsonEncoder, createJsonDecoder} from 'ts-runtypes';

// Your own class. ts-runtypes can't guess how to put it on the wire, so
// you teach it once: a serialize/deserialize pair keyed by the class name.
class Money {
  constructor(
    public amount: number,
    public currency: string
  ) {}
}

registerClassSerializer<Money>('Money', {
  // instance -> JSON-ready data (the pipeline stringifies this for you)
  serialize: (m) => `${m.amount} ${m.currency}`,
  // parsed data -> rebuilt instance
  deserialize: (data) => {
    const [amount, currency] = String(data).split(' ');
    return new Money(Number(amount), currency);
  },
});

type Invoice = {id: string; total: Money};

const encode = createJsonEncoder<Invoice>();
const decode = createJsonDecoder<Invoice>();

const json = encode({id: 'inv_1', total: new Money(4999, 'USD')})!;
const back = decode(json); // back.total is a real Money instance again

export {Money, encode, decode, back};
export type {Invoice};
