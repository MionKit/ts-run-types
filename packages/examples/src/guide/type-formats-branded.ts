import type {FormatString, FormatNumber} from '@mionjs/ts-go-run-types/formats';

// Add a brand name (the 2nd type arg) and the format becomes a NOMINAL type.
// A plain string is no longer assignable — you must opt in with `as`.
type UserId = FormatString<{minLength: 1}, 'UserId'>;
type Cents = FormatNumber<{min: 0; integer: true}, 'Cents'>;

// A bare string won't fit — that's the point. Cast at the boundary where
// you've actually checked the value.
const id = 'usr_abc123' as UserId;
const price = 4999 as Cents;

// Now UserId and Cents don't mix with each other or with raw string/number.
function chargeUser(_user: UserId, _amount: Cents): void {}
chargeUser(id, price); // ok

export {id, price, chargeUser};
export type {UserId, Cents};
