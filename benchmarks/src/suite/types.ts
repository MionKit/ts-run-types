// Basic, shared type definitions for the validation benchmark.
//
// These are the SINGLE SOURCE OF TRUTH for the shapes every library validates.
// ts-go-run-types and typia derive their validators straight from these TS
// types (compile-time reflection); zod / typebox / ajv mirror the same shapes
// as hand-written schemas in their respective libs/ files. Keep the schemas in
// sync with these types — the runner cross-checks every validator against the
// same samples, so a drift shows up as a correctness failure.

export type StringType = string;
export type NumberType = number;
export type BooleanType = boolean;
export type BigIntType = bigint;

export interface User {
  id: number;
  name: string;
  active: boolean;
}

export interface UserWithOptional {
  id: number;
  name: string;
  nickname?: string;
}

export interface Address {
  street: string;
  city: string;
  zip: string;
}

export interface Company {
  name: string;
  address: Address;
  employees: User[];
}

export type NumberArray = number[];

export type StringOrNumber = string | number;

export type Status = 'active' | 'inactive' | 'pending';

export type Pair = [string, number];

export type ScoreMap = Record<string, number>;

export interface Nullable {
  value: string | null;
}

// A realistic DTO that combines several of the above shapes.
export interface Order {
  id: number;
  customer: User;
  items: Array<{sku: string; qty: number; price: number}>;
  status: Status;
  note?: string;
  total: number;
}
