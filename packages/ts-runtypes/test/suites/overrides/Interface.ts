import {
  createValidate,
  overrideValidate,
  createGetValidationErrors,
  overrideGetValidationErrors,
  createJsonEncoder,
  overrideJsonEncoder,
  createJsonDecoder,
  overrideJsonDecoder,
  createBinaryEncoder,
  overrideBinaryEncoder,
  createBinaryDecoder,
  overrideBinaryDecoder,
} from 'ts-runtypes';
import type {OverrideCase} from './types.ts';

// Branded interface — the `__brand` literal gives it a unique structural id.
type InterfaceTarget = {readonly __brand: 'interfaceOverride'; a: number; b: string};

overrideValidate<InterfaceTarget>((v): v is InterfaceTarget => (v as {a?: number} | null)?.a === 1);
overrideGetValidationErrors<InterfaceTarget>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'override'} as never);
  return out;
});
overrideJsonEncoder<InterfaceTarget>((v) => 'OVR' + JSON.stringify(v));
overrideJsonDecoder<InterfaceTarget>((serialized) => JSON.parse((serialized as string).slice(3)) as never);
overrideBinaryEncoder<InterfaceTarget>((value, Ser) => {
  Ser.serString(JSON.stringify(value));
  return Ser;
});
overrideBinaryDecoder<InterfaceTarget>((ret, Des) => JSON.parse(Des.desString()) as never);

export const INTERFACE_OVERRIDE: OverrideCase = {
  title: 'Interface',
  validate: () => createValidate<InterfaceTarget>(),
  validateSamples: {pass: [{a: 1, b: 'x'}], fail: [{a: 2, b: 'x'}, null]},
  getValidationErrors: () => createGetValidationErrors<InterfaceTarget>(),
  errorsValue: {a: 1, b: 'x'},
  jsonEncoder: () => createJsonEncoder<InterfaceTarget>(),
  jsonDecoder: () => createJsonDecoder<InterfaceTarget>(),
  jsonValue: {a: 7},
  jsonString: 'OVR' + JSON.stringify({a: 7}),
  binaryEncoder: () => createBinaryEncoder<InterfaceTarget>(),
  binaryDecoder: () => createBinaryDecoder<InterfaceTarget>(),
  binaryValue: {a: 1, b: 'y'},
};
