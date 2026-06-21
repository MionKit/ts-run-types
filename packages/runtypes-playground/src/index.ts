// runtypes-playground — embeddable in-browser ts-runtypes playground.
//
// Two surfaces:
//   - the headless engine (resolve + execute a type's build functions), also
//     available standalone at `runtypes-playground/core`;
//   - the <runtypes-playground> web component (registered on import), also at
//     `runtypes-playground/element`.
export * from './core/index.ts';
export {RuntypesPlaygroundElement, defineRuntypesPlayground, TAG} from './element/index.ts';
