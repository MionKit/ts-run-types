import {createValidate, type Static} from 'ts-runtypes';
import * as RT from 'ts-runtypes/schema';

type Point = {x: number; y: number};

// start-forms
// 1. Type-first — you supply the type, no value needed.
const isPointA = createValidate<Point>();

// 2. Value-first — T is inferred from a value you already have.
const origin: Point = {x: 0, y: 0};
const isPointB = createValidate(origin);

// 3. Schema-first — pass an RT.* schema; T is inferred from the schema.
const pointSchema = RT.object({x: RT.number(), y: RT.number()});
const isPointC = createValidate(pointSchema);
// end-forms

// All three resolve to the same generated validator.
type PointFromSchema = Static<typeof pointSchema>;

export {isPointA, isPointB, isPointC};
export type {PointFromSchema};
