import {registerAnonymousPureFn} from '@ts-runtypes/core';

// The anonymous lane takes only the factory. The compiler derives a stable
// identity from the function body and injects it for you, so there is no
// "namespace::name" literal to write. The same rules apply: the helper must be
// self-contained, with everything it needs declared inside the factory.

export const compiledDouble = registerAnonymousPureFn(function () {
  return function _double(n: number): number {
    return n * 2;
  };
});
