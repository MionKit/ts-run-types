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

// Array of a branded element — the unique element gives the array a unique id.
type ArrayItem = {readonly __brand: 'arrayOverride'; n: number};
type ArrayTarget = ArrayItem[];

overrideValidate<ArrayTarget>((v): v is ArrayTarget => Array.isArray(v) && (v as {n?: number}[])[0]?.n === 1);
overrideGetValidationErrors<ArrayTarget>((value, path, errors) => {
  const out = errors ?? [];
  out.push({path: path ?? [], expected: 'override'} as never);
  return out;
});
overrideJsonEncoder<ArrayTarget>((v) => 'OVR' + JSON.stringify(v));
overrideJsonDecoder<ArrayTarget>((serialized) => JSON.parse((serialized as string).slice(3)) as never);
overrideBinaryEncoder<ArrayTarget>((value, Ser) => {
  Ser.serString(JSON.stringify(value));
  return Ser;
});
overrideBinaryDecoder<ArrayTarget>((ret, Des) => JSON.parse(Des.desString()) as never);

export const ARRAY_OVERRIDE: OverrideCase = {
  title: 'Arrays',
  validate: () => createValidate<ArrayTarget>(),
  validateSamples: {pass: [[{n: 1}]], fail: [[{n: 2}], null]},
  getValidationErrors: () => createGetValidationErrors<ArrayTarget>(),
  errorsValue: [{n: 1}],
  jsonEncoder: () => createJsonEncoder<ArrayTarget>(),
  jsonDecoder: () => createJsonDecoder<ArrayTarget>(),
  jsonValue: [{n: 1}, {n: 2}],
  jsonString: 'OVR' + JSON.stringify([{n: 1}, {n: 2}]),
  binaryEncoder: () => createBinaryEncoder<ArrayTarget>(),
  binaryDecoder: () => createBinaryDecoder<ArrayTarget>(),
  binaryValue: [{n: 3}],
};
