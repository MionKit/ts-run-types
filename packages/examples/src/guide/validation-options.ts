import {createValidate} from '@ts-runtypes/core';

type Flag = {kind: 'on' | 'off'; values: number[]};

// start-options
// Pass an OBJECT LITERAL of options. The build reads the literal and routes
// the call to a specialized variant of the validator — nothing is read at runtime.

// noLiterals: a literal check degrades to its base type
// (here 'on' | 'off' becomes "any string").
const isFlagLoose = createValidate<Flag>(undefined, {noLiterals: true});

// noIsArrayCheck: skip the leading Array.isArray() guard on array validators
// (handy when you've already proven the value is an array upstream).
const isFlagFast = createValidate<Flag>(undefined, {noIsArrayCheck: true});
// end-options

export {isFlagLoose, isFlagFast};
