// runtypes-devtools/eslint — placeholder for the future RunTypes ESLint
// integration. The bundler transform (marker rewriting) lives at
// runtypes-devtools/vite and the other bundler entries; this entry will host
// lint rules (marker misuse, non-serialisable members surfaced at lint time)
// once designed. Tracked in docs/ROADMAP.md.
//
// Exported as an empty but valid ESLint flat-config plugin so importing the
// entry never breaks — it simply contributes no rules yet.
export const meta = {name: 'runtypes-devtools', version: '0.1.0'} as const;
export const rules = {} as const;
export const configs = {} as const;

export default {meta, rules, configs};
