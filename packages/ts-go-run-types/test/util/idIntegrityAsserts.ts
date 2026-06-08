// id-integrity assertions — verify that the value-first schema authoring path
// and the type-first path resolve to the SAME runtype (hence the same structural
// type id) for every case, reusing each case's EXISTING thunks (no new per-case
// data). Two reuse mechanisms, one per suite family:
//
//  - validators (isType / getTypeErrors): `createIsType` returns the CACHED
//    factory for a structural id, so reference identity (`toBe`) between the
//    schema-form factory and the type-form factory IS a same-id assertion — the
//    proven `valueFirstConvergence.test.ts` idiom, applied to every case. Same
//    id ⇒ same cached runtype.
//  - serializers (json / binary encoders): the encoder is a fresh closure each
//    call, so identity doesn't apply; instead assert the schema-form encoder
//    produces byte-identical output to the type-form encoder (same default
//    strategy) on the case's samples — identical wire output ⇒ same resolved
//    runtype.
//
// Option-degraded validator cases (the type-first thunk passes `noLiterals` /
// `noIsArrayCheck`) resolve a distinct cache VARIANT from the plain value-first
// builder, so they converge in behaviour but not in cached-factory identity —
// skipped via the case's `idDivergent` flag.

import {expect} from 'vitest';
import type {Thunk, ValidationCase} from '../suites/validation/types.ts';
import type {SerializationCase} from '../suites/serialization/types.ts';
import {deepCloneForRoundTrip} from './equalsHelpers.ts';

function resolveThunk<T>(thunk: Thunk<T> | undefined): (() => T) | undefined {
  if (!thunk || thunk === 'not-supported') return undefined;
  return thunk;
}

/** Validator id-integrity: the value-first schema form and the type-first form
 *  must resolve to the SAME cached factory (reference identity) for both the
 *  isType and getTypeErrors families. Skips factoryThrows (both forms throw at
 *  build) and idDivergent (option-variant) cases, and any case missing one of
 *  the two forms (`'not-supported'` / omitted). **/
export function assertValidatorIdIntegrity(c: ValidationCase): void {
  if (c.factoryThrows) return;
  if (c.idDivergent) return;

  const isType = resolveThunk(c.isType);
  const isTypeSchema = resolveThunk(c.isTypeSchema);
  if (isType && isTypeSchema) {
    expect(
      isTypeSchema(),
      `${c.title}: isType — value-first schema and type-first must resolve the SAME cached factory (same structural id)`
    ).toBe(isType());
  }

  const getTypeErrors = resolveThunk(c.getTypeErrors);
  const getTypeErrorsSchema = resolveThunk(c.getTypeErrorsSchema);
  if (getTypeErrors && getTypeErrorsSchema) {
    expect(
      getTypeErrorsSchema(),
      `${c.title}: getTypeErrors — value-first schema and type-first must resolve the SAME cached factory (same structural id)`
    ).toBe(getTypeErrors());
  }
}

/** Serializer id-integrity: the value-first schema encoder must produce output
 *  identical to the type-first encoder (same default strategy) — json strings
 *  byte-for-byte, binary buffers byte-for-byte. Identical wire output ⇒ the two
 *  forms resolved the same runtype. Skips broad/best-effort types and
 *  factory-throwing / `'not-supported'` cases. **/
export function assertSerializerIdIntegrity(c: SerializationCase): void {
  // Broad types (any/unknown/object) encode via identity and may throw on
  // non-serialisable members — not a reliable id signal.
  if (c.roundTripBestEffort) return;

  const schemaEncoder = resolveThunk(c.schemaEncoder);
  if (schemaEncoder && !c.factoryThrows) {
    const schemaEncode = schemaEncoder();
    const typeEncode = c.stripCloneEncoder();
    const {values} = (c.getTestDataForStringify ?? c.getTestData)();
    values.forEach((reference, i) => {
      const fromSchema = schemaEncode(deepCloneForRoundTrip(reference));
      const fromType = typeEncode(deepCloneForRoundTrip(reference));
      expect(fromSchema, `${c.title}: json — value-first schema encoder output must equal type-first [values[${i}]]`).toBe(
        fromType
      );
    });
  }

  const schemaBinaryEncoder = resolveThunk(c.schemaBinaryEncoder);
  const binaryFactoryThrows = c.binaryFactoryThrows ?? c.factoryThrows ?? false;
  if (schemaBinaryEncoder && c.binaryEncoder && !binaryFactoryThrows) {
    const schemaEncode = schemaBinaryEncoder();
    const typeEncode = c.binaryEncoder();
    const {values} = (c.getBinaryTestData ?? c.getTestDataForStringify ?? c.getTestData)();
    values.forEach((reference, i) => {
      const fromSchema = new Uint8Array(schemaEncode(deepCloneForRoundTrip(reference)));
      const fromType = new Uint8Array(typeEncode(deepCloneForRoundTrip(reference)));
      expect(fromSchema, `${c.title}: binary — value-first schema encoder bytes must equal type-first [values[${i}]]`).toEqual(
        fromType
      );
    });
  }
}
