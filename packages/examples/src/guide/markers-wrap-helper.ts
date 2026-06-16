import {getRTUtils, type InjectRunTypeId} from 'ts-runtypes';

// Wrap ts-runtypes into your OWN helper. Declare a trailing
// `id?: InjectRunTypeId<T>` parameter and the build fills it in at every
// call site — you never pass the id yourself.
function describe<T>(id?: InjectRunTypeId<T>): string {
  // At runtime `id` is just the resolved hash string. Look the type up in
  // the registry and do whatever your helper needs.
  const runType = getRTUtils().getRunType(id!);
  return runType ? `type #${id}` : 'unknown type';
}

// Call it like any generic function — no id argument in sight.
describe<{id: number; name: string}>();
describe<string[]>();

export {describe};
