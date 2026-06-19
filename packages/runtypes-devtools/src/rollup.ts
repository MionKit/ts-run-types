// runtypes-devtools/rollup — the Rollup plugin (`unplugin.rollup`). The
// virtual-module scheme (\0-prefixed ids) is native to Rollup, so the
// transform + per-entry cache modules behave the same as under Vite.
import {unplugin} from './unplugin.ts';

export * from './unplugin.ts';
export default unplugin.rollup;
