import {getRunTypeId, type InjectRunTypeId} from '@mionjs/ts-go-run-types';

// A stable id for any type — the reflection TypeScript refused to ship.
const userId = getRunTypeId<{id: number; name: string}>(); // e.g. "Ab3Xy7"

// Or let it be inferred from a runtime value.
const order = {id: 1, total: 42};
const orderId = getRunTypeId(order);

// Wrap ts-run-types into your OWN helper: declare a trailing InjectRunTypeId<T>
// parameter and the build fills it in at every call site for you.
function parseJson<T>(raw: string, id?: InjectRunTypeId<T>): T {
  // ...look the type's validator / decoder up by `id`, then parse safely.
  return JSON.parse(raw) as T;
}

parseJson<{id: number}>('{"id":1}');

export {userId, orderId};
