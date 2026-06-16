import {createValidate} from 'ts-runtypes';
import type {FormatString, FormatNumber, FormatBigInt} from 'ts-runtypes/formats';

// FormatString / FormatNumber / FormatBigInt are the escape hatches: pass
// your own params when no named format fits.
type Username = FormatString<{minLength: 3; maxLength: 20; pattern: {source: '^[a-z0-9_]+$'; mockSamples: ['ada_99', 'grace']}}>;
type Percentage = FormatNumber<{min: 0; max: 100}>;
type BigPositive = FormatBigInt<{min: 0n}>;

type Profile = {
  handle: Username;
  completion: Percentage;
  followers: BigPositive;
};

const isProfile = createValidate<Profile>();

isProfile({handle: 'ada_99', completion: 80, followers: 1200n}); // true
isProfile({handle: 'no', completion: 150, followers: -1n}); // false

export {isProfile};
export type {Profile};
