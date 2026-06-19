// Root entry for runtypes-devtools — the framework-agnostic unplugin
// instance (default export) plus the shared option types, the diagnostic
// formatter, and the wire constants. Bundler-specific entry points live at
// runtypes-devtools/vite, /rollup, /webpack, /rspack and /esbuild; the
// future lint integration at runtypes-devtools/eslint.
export * from './unplugin.ts';
export {default} from './unplugin.ts';
