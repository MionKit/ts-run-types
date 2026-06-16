import {createValidate, type InjectRunTypeId} from 'ts-runtypes';

// A realistic wrapper: parse JSON and validate it against T in one call.
// The trailing `id?: InjectRunTypeId<T>` opts the helper into the toolchain.
function parseChecked<T>(raw: string, id?: InjectRunTypeId<T>): T {
  const data = JSON.parse(raw) as T;
  // Build a validator for T (createValidate is itself marker-driven).
  const isValid = createValidate<T>();
  if (!isValid(data)) throw new Error(`bad payload for type #${id}`);
  return data;
}

type User = {id: number; name: string};

// One call site, fully typed. The build injects User's id behind the scenes.
const user = parseChecked<User>('{"id":1,"name":"Ada"}');

export {parseChecked, user};
