// <runtypes-playground> — a light-DOM custom element wrapping the headless
// engine. Lazy-loads Monaco on connect and renders a three-column editor:
//   1. Type      — the TypeScript type (or value-first schema) editor.
//   2. Function  — a build-function picker, a JS-expression input pane (accepts
//                  Map / Set / Date / bigint / …, not just JSON) with "Random
//                  valid" / "Random invalid" buttons (createMockType + a type-aware
//                  negative generator), a Run button, and the result beneath it.
//   3. Generated — the code RunTypes generates for the SELECTED function + type,
//                  prettier-beautified and syntax-highlighted. It refreshes (with
//                  a typing spinner + debounce) whenever the function or type
//                  changes.
//
// Above the columns: real-world presets and a TS-type / Schema mode switch.
//
// Light DOM (no shadow root) is intentional so Monaco's layout measurement and
// head-injected styles work. Highlighting reuses Monaco's own colorizer (no extra
// dependency, same theme as the editors); prettier is lazy-loaded for beautifying.
// Configurable via attributes: `type`, `input`, `operation`, `mode`, `wasm-url`,
// `wasm-exec-url`.

import {
  run,
  mock,
  mockInvalid,
  versions,
  generatedCache,
  transformedSource,
  factoryImport,
  factoryCall,
  OPERATIONS,
  operationByKey,
  ROOT_TYPE,
  formatsEditorModule,
  schemaEditorModule,
  type RunResult,
  type Diagnostic,
  type Mode,
  type ResolverOptions,
} from '../core/index.ts';
import {STYLES} from './styles.ts';
import {PRESETS, type Preset} from './presets.ts';
import {TS_ICON, JS_ICON, INFO_ICON} from './icons.ts';

type Monaco = typeof import('monaco-editor');
type Editor = import('monaco-editor').editor.IStandaloneCodeEditor;
type EditorOptions = import('monaco-editor').editor.IStandaloneEditorConstructionOptions;
type PrettierApi = {format: (src: string, opts: Record<string, unknown>) => Promise<string>; plugins: unknown[]};

// Debounce before regenerating the code column: long while typing in the type
// editor, short for a discrete change (function picker / preset / mode).
const TYPE_DEBOUNCE_MS = 2000;
const PICK_DEBOUNCE_MS = 150;

// Ambient declarations so the editor type-checks the snippet: the createX
// factories (the engine appends the call). The schema / formats modules the user
// imports are registered separately (schemaEditorModule / formatsEditorModule);
// the WASM resolver, not Monaco, is the source of truth for resolution.
const EDITOR_DTS = `declare module 'ts-runtypes' {
  export function createValidate<T>(val?: T): (v: unknown) => v is T;
  export function createGetValidationErrors<T>(val?: T): (v: unknown) => unknown[];
  export function createJsonEncoder<T>(val?: T): (v: T) => unknown;
  export function createJsonDecoder<T>(val?: T): (v: unknown) => T;
  export function createBinaryEncoder<T>(val?: T): (v: T) => Uint8Array;
  export function createBinaryDecoder<T>(val?: T): (v: Uint8Array) => T;
  export function createMockType<T>(val?: T): () => T;
  export function getRunTypeId<T>(value?: T): string;
  export function getRunType<T>(value?: T): unknown;
}`;

let stylesInjected = false;
function injectStyles(): void {
  if (stylesInjected) return;
  const style = document.createElement('style');
  style.dataset.rtPlayground = 'true';
  style.textContent = STYLES;
  document.head.appendChild(style);
  stylesInjected = true;
}

function ensureMonacoWorkers(): void {
  const scope = globalThis as unknown as {MonacoEnvironment?: unknown};
  if (scope.MonacoEnvironment) return;
  scope.MonacoEnvironment = {
    getWorker(): Worker {
      return new Worker(URL.createObjectURL(new Blob([''], {type: 'application/javascript'})));
    },
  };
}

function escapeHtml(text: unknown): string {
  return String(text).replace(/[&<>]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c] as string);
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? `${v}n` : v instanceof Uint8Array ? Array.from(v) : v), 2);
}

// jsKey renders an object key as a bare identifier when valid, else a quoted string.
function jsKey(key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? key : JSON.stringify(key);
}

// jsValue serializes a value to a JS-source EXPRESSION (not JSON), so the input
// pane round-trips the full value space createMockType produces — Map / Set / Date
// / RegExp / bigint / typed arrays — which JSON can't represent. Indented for
// readability; functions / symbols become `undefined` (the validators ignore them).
function jsValue(value: unknown, pad = ''): string {
  const inner = `${pad}  `;
  if (value === null) return 'null';
  switch (typeof value) {
    case 'undefined':
      return 'undefined';
    case 'string':
      return JSON.stringify(value);
    case 'number':
    case 'boolean':
      return String(value);
    case 'bigint':
      return `${value}n`;
    case 'function':
    case 'symbol':
      return 'undefined';
  }
  if (value instanceof Date) return `new Date(${JSON.stringify(value.toISOString())})`;
  if (value instanceof RegExp) return value.toString();
  if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
    return `new ${value.constructor.name}([${Array.from(value as unknown as ArrayLike<number>).join(', ')}])`;
  }
  if (value instanceof Map) {
    if (value.size === 0) return 'new Map()';
    const entries = Array.from(value, ([k, v]) => `${inner}[${jsValue(k, inner)}, ${jsValue(v, inner)}]`).join(',\n');
    return `new Map([\n${entries},\n${pad}])`;
  }
  if (value instanceof Set) {
    if (value.size === 0) return 'new Set()';
    const items = Array.from(value, (v) => `${inner}${jsValue(v, inner)}`).join(',\n');
    return `new Set([\n${items},\n${pad}])`;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => `${inner}${jsValue(v, inner)}`).join(',\n')},\n${pad}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return '{}';
  return `{\n${keys.map((k) => `${inner}${jsKey(k)}: ${jsValue(obj[k], inner)}`).join(',\n')},\n${pad}}`;
}

// parseJsInput evaluates the input pane as a JS expression, so Map / Set / Date /
// RegExp / bigint / typed-array literals are accepted (not only JSON).
//
// SECURITY — this uses `new Function`. It is safe ONLY because the evaluated code
// is the USER'S OWN, typed locally and run on an explicit Run click: self-XSS is
// not a vulnerability (it is the devtools console). The playground reads NO input
// from any untrusted source — there is no URL / query / hash / postMessage / window
// .name reading anywhere, the `input` attribute is set only by hard-coded presets,
// and nothing auto-runs. The site is static with no cookies or secrets, and the
// engine itself already evaluates RunTypes' generated validators via `new Function`.
// HARD INVARIANT: never source the input (or the `input` / `type` / `wasm-url`
// attributes) from a URL param, postMessage, or any attacker-controllable channel —
// that is the one change that would turn this into a real XSS vector.
function parseJsInput(code: string): unknown {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  return new Function(`return (${trimmed});`)();
}

// formatJsonMaybe pretty-prints a JSON string (the encoders return a serialized
// string) so the Encoded block reads as formatted JSON rather than a quoted,
// double-escaped string literal. Non-string values fall back to `stringify`; an
// unparseable string is shown verbatim.
function formatJsonMaybe(value: unknown): string {
  if (typeof value !== 'string') return stringify(value);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

// stepBadge renders a numbered circle beside a column title. Hovering or focusing
// it reveals `tip` — a self-contained CSS tooltip (the standalone component can't
// rely on the host's tooltip primitives). The button is keyboard-focusable so the
// tip is reachable without a pointer. `openLeft` anchors the bubble to the badge's
// right edge (for the rightmost column, so a wide tip can't overflow the panel).
function stepBadge(n: number, tip: string, openLeft = false): string {
  const tipClass = openLeft ? 'rtpg-tip rtpg-tip-left' : 'rtpg-tip';
  return `<button type="button" class="rtpg-step" aria-label="Step ${n}: ${escapeHtml(tip)}">${n}<span class="${tipClass}" role="tooltip">${escapeHtml(tip)}</span></button>`;
}

// The per-title guidance shown in each numbered badge's tooltip.
const STEP_TIPS = {
  source: 'Edit MyType and watch the change flow through to the transformed source and the generated functions.',
  transformed:
    'The transformed code: the generated functions are imported and referenced by a stable type id (one id per type). RunTypes makes the smallest change it can to your original source.',
  cache:
    'The real, ready-to-run code RunTypes generates for your type. This is what actually executes for the function you picked, specialized to your exact shape (no schema walking or reflection at runtime).',
  function: 'Pick one of the functions RunTypes generates from your type, then run it against the input below.',
} as const;

function renderDiagnostics(diagnostics: Diagnostic[]): string {
  if (!diagnostics || diagnostics.length === 0) return '';
  const items = diagnostics
    .map((d) => {
      const severity = String(d.severity ?? d.Severity ?? '').toLowerCase();
      const code = d.code ?? d.Code ?? '';
      const message = d.message ?? d.Message ?? '';
      return `<div class="rtpg-diag-item ${severity}">${escapeHtml(`${severity.toUpperCase()} ${code}: ${message}`)}</div>`;
    })
    .join('');
  return `<div class="rtpg-diag"><div class="rtpg-block-label">Diagnostics</div>${items}</div>`;
}

export class RuntypesPlaygroundElement extends HTMLElement {
  private monaco: Monaco | null = null;
  private prettier: PrettierApi | null = null;
  private typeEditor: Editor | null = null;
  private inputEditor: Editor | null = null;
  // The read-only `import { … }` header and `const … = createX<MyType>()` footer
  // editors that sandwich the editable type body, making the snippet read as a
  // real file (see updateSurrounding / makeStripEditor).
  private headerEditor: Editor | null = null;
  private footerEditor: Editor | null = null;
  private els: Record<string, HTMLElement> = {};
  private booted = false;
  private ready = false;
  private mode: Mode = 'type';
  private presetIndex = 0;
  private codeTimer: ReturnType<typeof setTimeout> | null = null;
  private codeSeq = 0;

  connectedCallback(): void {
    if (this.booted) return;
    this.booted = true;
    void this.boot();
  }

  // Dispose the Monaco editors (and pending codegen timer) when the element leaves
  // the DOM so a host that mounts/unmounts the playground (SPA navigation) does not
  // leak editor instances. Resetting `booted` lets a re-attached element boot again.
  disconnectedCallback(): void {
    if (this.codeTimer) clearTimeout(this.codeTimer);
    this.headerEditor?.dispose();
    this.footerEditor?.dispose();
    this.typeEditor?.dispose();
    this.inputEditor?.dispose();
    this.headerEditor = this.footerEditor = this.typeEditor = this.inputEditor = null;
    this.booted = false;
  }

  // Programmatic API — lets hosts (and tests) drive the component.
  setType(code: string): void {
    this.typeEditor?.setValue(code);
  }
  setInput(json: string): void {
    this.inputEditor?.setValue(json);
  }
  setOperation(key: string): void {
    (this.els.operation as HTMLSelectElement).value = key;
    this.onOperationChanged();
  }
  runNow(): Promise<void> {
    return this.doRun();
  }
  get outputText(): string {
    return this.els.output?.textContent ?? '';
  }
  get generatedText(): string {
    return this.els.codeview?.textContent ?? '';
  }

  private resolverOptions(): ResolverOptions {
    return {wasmUrl: this.getAttribute('wasm-url') ?? undefined, wasmExecUrl: this.getAttribute('wasm-exec-url') ?? undefined};
  }

  private currentOp(): RunResult['op'] {
    return operationByKey((this.els.operation as HTMLSelectElement).value);
  }

  // colorize reuses Monaco's tokenizer/theme to syntax-highlight a snippet to HTML.
  private async highlight(code: string, lang: string): Promise<string> {
    if (!this.monaco) return escapeHtml(code);
    try {
      return await this.monaco.editor.colorize(code, lang, {tabSize: 2});
    } catch {
      return escapeHtml(code);
    }
  }

  // loadPrettier lazy-loads the prettier standalone bundle + babel/estree plugins once.
  private async loadPrettier(): Promise<PrettierApi> {
    if (!this.prettier) {
      const [standalone, babel, estree] = await Promise.all([
        import('prettier/standalone'),
        import('prettier/plugins/babel'),
        import('prettier/plugins/estree'),
      ]);
      const plugin = (m: unknown): unknown => (m as {default?: unknown}).default ?? m;
      this.prettier = {format: standalone.format, plugins: [plugin(babel), plugin(estree)]};
    }
    return this.prettier;
  }

  // beautifyModule pretty-prints module source verbatim (the generated cache
  // `export const __rt_… = […]` module). No wrapper: it is already a top-level
  // statement, unlike a bare function body.
  private async beautifyModule(code: string): Promise<string> {
    try {
      const prettier = await this.loadPrettier();
      return (await prettier.format(code, {parser: 'babel', plugins: prettier.plugins, printWidth: 84, tabWidth: 2})).trimEnd();
    } catch {
      return code;
    }
  }

  // beautify pretty-prints a generated function body with prettier (lazy-loaded).
  // The body has a top-level `return`, so it is wrapped for the parser, then the
  // wrapper line + one indent level are stripped back off.
  private async beautify(code: string): Promise<string> {
    try {
      const prettier = await this.loadPrettier();
      const out = (
        await prettier.format(`function __rt() {\n${code}\n}`, {
          parser: 'babel',
          plugins: prettier.plugins,
          printWidth: 84,
          tabWidth: 2,
        })
      ).trimEnd();
      const lines = out.split('\n');
      if (lines[0].startsWith('function __rt') && lines[lines.length - 1] === '}') {
        return lines
          .slice(1, -1)
          .map((l) => (l.startsWith('  ') ? l.slice(2) : l))
          .join('\n');
      }
      return out;
    } catch {
      return code;
    }
  }

  // makeStripEditor creates a read-only one-liner editor (the import header / the
  // call footer). It shares the body editor's gutter config so the line numbers
  // align, sizes itself to its content, and is overlaid with a hatch pattern + a
  // click-swallowing layer so it reads as fixed, non-editable boilerplate.
  private makeStripEditor(el: HTMLElement, value: string, base: EditorOptions): Editor {
    const editor = this.monaco!.editor.create(el, {
      ...base,
      value,
      language: 'typescript',
      readOnly: true,
      domReadOnly: true,
      renderLineHighlight: 'none',
      contextmenu: false,
      scrollbar: {vertical: 'hidden', horizontalScrollbarSize: 6, alwaysConsumeMouseWheel: false},
    });
    // Size the container to the content so the strip is exactly as tall as its
    // line(s); re-runs when the import / call text changes (setValue).
    const fit = (): void => {
      const height = editor.getContentHeight();
      el.style.height = `${height}px`;
      editor.layout({width: el.clientWidth, height});
    };
    editor.onDidContentSizeChange(fit);
    fit();
    return editor;
  }

  // updateLineNumberOffsets keeps the three stacked editors numbered as one file:
  // the header owns lines 1..H, the body continues from H+1, the footer is the
  // line after the body. Recomputed whenever the body's line count changes.
  private updateLineNumberOffsets(): void {
    const headerLines = this.headerEditor?.getModel()?.getLineCount() ?? 1;
    const bodyLines = this.typeEditor?.getModel()?.getLineCount() ?? 1;
    this.typeEditor?.updateOptions({lineNumbers: (n: number) => String(n + headerLines)});
    this.footerEditor?.updateOptions({lineNumbers: (n: number) => String(n + headerLines + bodyLines)});
  }

  // updateSurrounding refreshes the read-only header (import) and footer (call)
  // for the selected function + mode. The body between them is the user's type.
  private updateSurrounding(): void {
    const op = this.currentOp();
    this.headerEditor?.setValue(factoryImport(op.factory));
    this.footerEditor?.setValue(factoryCall(op.factory, op.varName, this.mode, undefined, op.options));
    this.updateLineNumberOffsets();
  }

  private buildDom(): void {
    injectStyles();
    this.classList.add('rt-playground');
    this.innerHTML = `
      <div class="rtpg-toolbar">
        <div class="rtpg-typegroup">
          <div class="rtpg-modeswitch" role="group" aria-label="type form">
            <button type="button" class="rtpg-mode" data-mode="type" title="TypeScript type">${TS_ICON}<span>TS type</span></button>
            <button type="button" class="rtpg-mode" data-mode="schema" title="ts-runtypes schema (value-first)">${JS_ICON}<span>Schema</span></button>
          </div>
          <span class="rtpg-typegroup-sep"></span>
          <div class="rtpg-presets" data-el="presets"></div>
        </div>
        <!-- TODO(playground): re-add a "Random type" button once the generator is
             refined. It drove RunTypes' fuzz type generator (test/fuzz/typeGen.ts),
             but that emits an overly-adversarial space and named decls / kinds that
             aren't always cleanly reflected in MyType. Refine to a JSON-friendly
             generator that stays within MyType before bringing the button back. -->
      </div>
      <div class="rtpg-layout">
        <section class="rtpg-pane rtpg-typepane">
          <div class="rtpg-head">
            <span class="rtpg-head-title"><h2>Source</h2>${stepBadge(1, STEP_TIPS.source)}</span>
            <span class="rtpg-hint" data-el="typeHint">define <code>${ROOT_TYPE}</code></span>
          </div>
          <div class="rtpg-typestack">
            <div class="rtpg-ro-wrap rtpg-ro-header">
              <div class="rtpg-ro-editor" data-el="headerEditor"></div>
              <div class="rtpg-ro-hatch" aria-hidden="true"></div>
            </div>
            <div class="rtpg-editor" data-el="editor"></div>
            <div class="rtpg-ro-wrap rtpg-ro-footer">
              <div class="rtpg-ro-editor" data-el="footerEditor"></div>
              <div class="rtpg-ro-hatch" aria-hidden="true"></div>
            </div>
          </div>
          <div class="rtpg-subhead">
            <span class="rtpg-head-title"><h3>Transformed Src</h3>${stepBadge(2, STEP_TIPS.transformed)}</span>
            <span class="rtpg-head-status">
              <span class="rtpg-busy-spinner" data-el="transformBusy" hidden></span>
              <span class="rtpg-hint">the import + argument RunTypes injects</span>
            </span>
          </div>
          <div class="rtpg-transformview" data-el="transformview"><div class="rtpg-placeholder">resolving…</div></div>
        </section>
        <section class="rtpg-pane">
          <div class="rtpg-head">
            <span class="rtpg-head-title"><h2>Generated Cache</h2>${stepBadge(3, STEP_TIPS.cache)}</span>
            <span class="rtpg-head-status">
              <span class="rtpg-busy-spinner" data-el="cacheBusy" hidden></span>
              <span class="rtpg-hint" data-el="codeHint"></span>
            </span>
          </div>
          <div class="rtpg-codeview" data-el="codeview"><div class="rtpg-placeholder">resolving…</div></div>
        </section>
        <section class="rtpg-pane">
          <div class="rtpg-head">
            <span class="rtpg-head-title"><h2>Pick a Function</h2>${stepBadge(4, STEP_TIPS.function, true)}</span>
          </div>
          <div class="rtpg-controls">
            <label class="rtpg-field">
              <select class="rtpg-select" data-el="operation"></select></label>
            <div class="rtpg-info" data-el="info">
              <span class="rtpg-info-icon" aria-hidden="true">${INFO_ICON}</span>
              <div class="rtpg-info-text">
                <div class="rtpg-info-title" data-el="infoTitle"></div>
                <div class="rtpg-info-detail" data-el="infoDetail"></div>
              </div>
            </div>
            <div class="rtpg-field rtpg-input-field" data-el="inputField">
              <div class="rtpg-field-label-row"><span class="rtpg-field-label">Input (JS)</span>
                <span class="rtpg-btn-row">
                  <button type="button" class="rtpg-ghost-btn" data-el="genRandom" title="Generate a valid random value with createMockType">Random valid</button>
                  <button type="button" class="rtpg-ghost-btn" data-el="genInvalid" title="Generate a random value that fails validation">Random invalid</button>
                </span></div>
              <div class="rtpg-input-editor" data-el="inputEditor"></div>
              <div class="rtpg-mock-badge" data-el="mockBadge">Sample data generated by RunTypes <code>createMockType&lt;${ROOT_TYPE}&gt;()</code></div>
            </div>
            <button type="button" class="rtpg-run-btn" data-el="run" disabled>Run</button>
            <div class="rtpg-result-label">Result <span class="rtpg-hint" data-el="timing"></span></div>
            <div class="rtpg-result" data-el="output"><div class="rtpg-placeholder">Run to see the result</div></div>
          </div>
        </section>
      </div>
      <div class="rtpg-overlay" data-el="overlay">
        <div class="rtpg-overlay-box">
          <span class="rtpg-spinner rtpg-spinner-lg"></span>
          <div class="rtpg-overlay-title">Loading the playground</div>
          <div class="rtpg-overlay-sub">Fetching the editor and the resolver (a few MB). Everything runs in your browser.</div>
        </div>
      </div>`;
    for (const node of Array.from(this.querySelectorAll<HTMLElement>('[data-el]'))) {
      this.els[node.dataset.el as string] = node;
    }
  }

  private async boot(): Promise<void> {
    this.buildDom();
    ensureMonacoWorkers();
    const monaco: Monaco = await import('monaco-editor');
    this.monaco = monaco;

    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowNonTsExtensions: true,
      strict: true,
      noEmit: true,
    });
    monaco.languages.typescript.typescriptDefaults.addExtraLib(EDITOR_DTS, 'file:///node_modules/ts-runtypes/index.d.ts');
    // The type-format catalog so a user's `import { Email } from 'ts-runtypes/formats'` resolves.
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      formatsEditorModule(),
      'file:///node_modules/ts-runtypes/formats/index.d.ts'
    );
    // The schema builders so a user's `import * as RT from 'ts-runtypes/schema'` resolves.
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      schemaEditorModule(),
      'file:///node_modules/ts-runtypes/schema/index.d.ts'
    );
    // The input pane is a JS value EXPRESSION (objects, Map, Set, Date, bigint, …),
    // evaluated at Run, not type-checked — turn off JS diagnostics so it never shows
    // squiggles (a malformed value surfaces as a Run error instead).
    monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });

    const common = {
      theme: 'vs-dark',
      minimap: {enabled: false},
      automaticLayout: true,
      fontSize: 13,
      scrollBeyondLastLine: false,
    } as const;
    // Gutter-affecting options shared by the header / body / footer editors so
    // their line-number columns line up pixel-for-pixel (they read as one file).
    const stackEditor = {
      ...common,
      folding: false,
      glyphMargin: false,
      lineNumbersMinChars: 3,
      lineDecorationsWidth: 6,
      overviewRulerLanes: 0,
      tabSize: 2,
    } as const;
    this.headerEditor = this.makeStripEditor(this.els.headerEditor, factoryImport(OPERATIONS[0].factory), stackEditor);
    this.typeEditor = monaco.editor.create(this.els.editor, {
      ...stackEditor,
      value: this.getAttribute('type') ?? PRESETS[0].ts,
      language: 'typescript',
      // The header sits above as line 1, so the body's numbers start at 2 — the
      // stack reads as one continuous file (offsets recomputed in updateLineNumberOffsets).
      lineNumbers: (n: number) => String(n + 1),
    });
    this.footerEditor = this.makeStripEditor(
      this.els.footerEditor,
      factoryCall(OPERATIONS[0].factory, OPERATIONS[0].varName, 'type'),
      stackEditor
    );
    this.inputEditor = monaco.editor.create(this.els.inputEditor, {
      ...common,
      value: this.getAttribute('input') ?? PRESETS[0].input,
      language: 'javascript',
      lineNumbers: 'off',
    });

    const runKey = monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter;
    this.typeEditor.addCommand(runKey, () => void this.doRun());
    this.inputEditor.addCommand(runKey, () => void this.doRun());
    // Typing in the type editor refreshes the generated-code column (debounced,
    // with the spinner showing from the first keystroke) and keeps the footer's
    // line number in step with the body's line count (immediate).
    this.typeEditor.onDidChangeModelContent(() => {
      this.updateLineNumberOffsets();
      this.scheduleCodegen(TYPE_DEBOUNCE_MS);
    });
    this.updateLineNumberOffsets();

    this.buildPresets();
    this.buildModeSwitch();

    const select = this.els.operation as HTMLSelectElement;
    // Group the options by family (Validation / JSON encode / JSON decode / …) so
    // the strategy variants read as a small menu rather than a flat list.
    let group: HTMLOptGroupElement | null = null;
    for (const op of OPERATIONS) {
      if (!group || group.label !== op.group) {
        group = document.createElement('optgroup');
        group.label = op.group;
        select.appendChild(group);
      }
      const option = document.createElement('option');
      option.value = op.key;
      option.textContent = op.menuLabel;
      group.appendChild(option);
    }
    select.value = this.getAttribute('operation') ?? OPERATIONS[0]?.key ?? '';
    this.syncInputVisibility();
    this.updateSurrounding();

    select.addEventListener('change', () => this.onOperationChanged());
    this.els.genRandom.addEventListener('click', () => void this.generateMock());
    this.els.genInvalid.addEventListener('click', () => void this.generateInvalid());
    this.els.run.addEventListener('click', () => void this.doRun());

    try {
      // versions() resolves once Monaco + the resolver WASM are loaded.
      await versions(this.resolverOptions());
      (this.els.run as HTMLButtonElement).disabled = false;
      this.ready = true;
      (this.els.overlay as HTMLElement).hidden = true;
      void this.updateSelectedCode();
    } catch (err) {
      this.els.overlay.innerHTML = `<div class="rtpg-overlay-box"><div class="rtpg-overlay-title">Could not load the playground</div><div class="rtpg-overlay-sub rtpg-overlay-err">${escapeHtml((err as Error).message)}</div></div>`;
    }
  }

  private buildPresets(): void {
    const host = this.els.presets;
    host.innerHTML = '';
    PRESETS.forEach((preset, index) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'rtpg-preset';
      btn.textContent = preset.name;
      btn.dataset.index = String(index);
      btn.addEventListener('click', () => this.loadPreset(index));
      host.appendChild(btn);
    });
    this.markActivePreset();
  }

  private buildModeSwitch(): void {
    for (const btn of Array.from(this.querySelectorAll<HTMLButtonElement>('.rtpg-mode'))) {
      btn.addEventListener('click', () => this.setMode(btn.dataset.mode as Mode));
    }
    this.markActiveMode();
  }

  private markActivePreset(): void {
    for (const btn of Array.from(this.querySelectorAll<HTMLButtonElement>('.rtpg-preset'))) {
      btn.classList.toggle('is-active', Number(btn.dataset.index) === this.presetIndex);
    }
  }

  private markActiveMode(): void {
    for (const btn of Array.from(this.querySelectorAll<HTMLButtonElement>('.rtpg-mode'))) {
      btn.classList.toggle('is-active', btn.dataset.mode === this.mode);
    }
    (this.els.typeHint as HTMLElement).innerHTML =
      this.mode === 'schema' ? `define <code>${ROOT_TYPE}</code> with RT/TF builders` : `define <code>${ROOT_TYPE}</code>`;
  }

  private currentPreset(): Preset {
    return PRESETS[this.presetIndex] ?? PRESETS[0];
  }

  private loadPreset(index: number): void {
    this.presetIndex = index;
    this.markActivePreset();
    const preset = this.currentPreset();
    this.typeEditor?.setValue(this.mode === 'schema' ? preset.schema : preset.ts);
    this.inputEditor?.setValue(preset.input);
    this.updateLineNumberOffsets();
    this.scheduleCodegen(PICK_DEBOUNCE_MS);
    this.resetResult();
  }

  private setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.markActiveMode();
    // Re-show the current preset in the new form so switching always yields a
    // valid snippet (custom edits in the other form are replaced).
    const preset = this.currentPreset();
    this.typeEditor?.setValue(mode === 'schema' ? preset.schema : preset.ts);
    // The call shape differs by mode (`createX<MyType>()` vs `createX(MyType)`).
    this.updateSurrounding();
    this.scheduleCodegen(PICK_DEBOUNCE_MS);
    this.resetResult();
  }

  private onOperationChanged(): void {
    this.syncInputVisibility();
    this.updateSurrounding();
    this.resetResult();
    this.scheduleCodegen(PICK_DEBOUNCE_MS);
  }

  // resetResult clears the (now stale) run output when the selected function changes.
  private resetResult(): void {
    this.els.output.innerHTML = '<div class="rtpg-placeholder">Run to see the result</div>';
    this.els.timing.textContent = '';
  }

  // syncInputVisibility reflects the selected function: shows/hides the input
  // pane, fills the info block (title + detail), and labels the run button
  // (getRunType "unpacks" the RunType rather than running a value).
  private syncInputVisibility(): void {
    const op = this.currentOp();
    (this.els.inputField as HTMLElement).hidden = !op.needsInput;
    this.els.infoTitle.textContent = op.blurb;
    this.els.infoDetail.textContent = op.detail;
    (this.els.run as HTMLButtonElement).textContent = op.kind === 'graph' ? 'Unpack RunTypes' : 'Run';
  }

  private typeSource(): string {
    return this.typeEditor?.getValue() ?? '';
  }

  // generateInto fills the input pane from a generator (valid mock or negative
  // mock) and shows a transient button state. It does NOT run — the result clears
  // to its placeholder so the user runs explicitly with the Run button.
  private async generateInto(generator: () => Promise<{value: unknown}>, btn: HTMLButtonElement, label: string): Promise<void> {
    if (!this.ready) return;
    btn.disabled = true;
    btn.textContent = 'generating…';
    try {
      const {value} = await generator();
      this.inputEditor?.setValue(jsValue(value));
      this.resetResult();
    } catch (err) {
      this.els.output.innerHTML = `<pre class="rtpg-code error">${escapeHtml((err as Error).message ?? String(err))}</pre>`;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  // generateMock fills the input pane with a fresh valid value from createMockType.
  private generateMock(): Promise<void> {
    return this.generateInto(
      () => mock(this.typeSource(), this.resolverOptions(), this.mode),
      this.els.genRandom as HTMLButtonElement,
      'Random valid'
    );
  }

  // generateInvalid fills the input pane with a value that fails validation —
  // a valid mock with one type-aware position corrupted (createMockType +
  // the negative generator), so the validators/decoders demonstrably reject it.
  private generateInvalid(): Promise<void> {
    return this.generateInto(
      () => mockInvalid(this.typeSource(), this.resolverOptions(), this.mode),
      this.els.genInvalid as HTMLButtonElement,
      'Random invalid'
    );
  }

  private async doRun(): Promise<void> {
    if (!this.ready) return;
    const op = this.currentOp();
    const userCode = this.typeSource();
    let input: unknown;
    if (op.needsInput) {
      try {
        input = parseJsInput(this.inputEditor?.getValue() ?? '');
      } catch (err) {
        this.els.output.innerHTML = `<pre class="rtpg-code error">${escapeHtml(`Invalid input:\n${(err as Error).message}`)}</pre>`;
        return;
      }
    }
    this.els.output.innerHTML = `<div class="rtpg-placeholder">running…</div>`;
    const started = performance.now();
    try {
      const result = await run(op.key, userCode, input, this.resolverOptions(), this.mode);
      this.els.timing.textContent = `${(performance.now() - started).toFixed(0)} ms`;
      this.els.output.innerHTML = await this.renderResult(result);
    } catch (err) {
      this.els.timing.textContent = '';
      this.els.output.innerHTML = `<pre class="rtpg-code error">${escapeHtml((err as Error).message ?? String(err))}</pre>`;
    }
  }

  // renderResult shows the run result (kept compact — it sits under the Run button).
  // For the decode functions the intermediate Encoded value is shown at the TOP of
  // the result, above the Decoded value, so the whole round trip reads top-down.
  private async renderResult(result: RunResult): Promise<string> {
    const diag = renderDiagnostics(result.diagnostics);
    const block = async (value: unknown): Promise<string> =>
      `<div class="rtpg-code">${await this.highlight(jsValue(value), 'javascript')}</div>`;
    // jsonBlock renders a serialized JSON string as formatted, highlighted JSON
    // (not a re-quoted, double-escaped string literal).
    const jsonBlock = async (value: unknown): Promise<string> =>
      `<pre class="rtpg-code">${await this.highlight(formatJsonMaybe(value), 'json')}</pre>`;
    const label = (text: string): string => `<div class="rtpg-block-label">${text}</div>`;
    switch (result.kind) {
      case 'predicate':
        return `<div class="rtpg-badge ${result.value ? 'ok' : 'bad'}">${result.value ? 'true ✓' : 'false ✗'}</div>${diag}`;
      case 'errors': {
        const ok = result.value.length === 0;
        const badge = `<div class="rtpg-badge ${ok ? 'ok' : 'bad'}">${ok ? 'valid — no errors' : `${result.value.length} error(s)`}</div>`;
        return `${badge}${ok ? '' : await block(result.value)}${diag}`;
      }
      case 'encode':
        return `${label('Encoded (JSON-safe)')}${await jsonBlock(result.value)}${diag}`;
      case 'jsonRoundtrip':
        return `${label('Encoded (input → encode)')}${await jsonBlock(result.encoded)}${label('Decoded')}${await block(result.decoded)}${diag}`;
      case 'binaryEncode':
        return `${label(`Binary (${result.byteLength} bytes)`)}<pre class="rtpg-code rtpg-hex">${escapeHtml(result.hex)}</pre>${diag}`;
      case 'binaryRoundtrip':
        return `${label(`Encoded (${result.byteLength} bytes)`)}<pre class="rtpg-code rtpg-hex">${escapeHtml(result.hex)}</pre>${label('Decoded')}${await block(result.decoded)}${diag}`;
      case 'graph':
        return `<div class="rtpg-badge ok">RunType resolved (${result.runTypes.length} node(s))</div>${label('Resolved RunType')}<pre class="rtpg-code">${await this.highlight(stringify(result.runTypes), 'json')}</pre>${diag}`;
    }
  }

  // scheduleCodegen marks the two code columns busy immediately, then regenerates
  // after `delay` ms — long for typing, short for a discrete change. The PREVIOUS
  // Transformed Src / Generated Cache output stays on screen (dimmed, with a small
  // header spinner) until the new output is ready, so an edit reads as an in-place
  // refresh instead of the whole section blanking out and reappearing.
  private scheduleCodegen(delay: number): void {
    if (this.codeTimer) clearTimeout(this.codeTimer);
    this.setCodegenBusy(true);
    this.codeTimer = setTimeout(() => void this.updateSelectedCode(), delay);
  }

  // setCodegenBusy toggles the "recompiling" affordance on the code columns: a
  // header spinner plus a dim over the (still-visible) prior output.
  private setCodegenBusy(busy: boolean): void {
    (this.els.cacheBusy as HTMLElement).hidden = !busy;
    (this.els.transformBusy as HTMLElement).hidden = !busy;
    this.els.codeview.classList.toggle('is-busy', busy);
    this.els.transformview.classList.toggle('is-busy', busy);
  }

  // updateSelectedCode renders the generated code for the SELECTED function + type.
  // For a build function it shows the beautified function body; for getRunTypeId it
  // shows the resolved RunType graph (its generated reflection data).
  private async updateSelectedCode(): Promise<void> {
    if (!this.ready) return;
    const seq = ++this.codeSeq;
    const op = this.currentOp();
    const userCode = this.typeSource();
    const opts = this.resolverOptions();
    // Keep the prior output visible while we recompile (busy dim + header spinner);
    // it is swapped for the new output below only once it is ready.
    this.setCodegenBusy(true);
    try {
      // The Generated Cache column shows the cache module(s) the transform imports:
      // the `export const __rt_… = […]` entry modules (their export names match the
      // `import { __rt_… }` in Transformed Src). One module for a single function; a
      // codec is a few that import each other - each rendered as its own section
      // labeled with its `virtual:rt/…` name. For getRunType it is the runtype bundle.
      const cacheModules = await generatedCache(op.factory, userCode, opts, this.mode, op.options);
      const html = cacheModules.length
        ? (
            await Promise.all(
              cacheModules.map(
                async (m) =>
                  `<div class="rtpg-cache-file"><div class="rtpg-cache-file-head">${escapeHtml(m.name)}</div><pre class="rtpg-code">${await this.highlight(await this.beautifyModule(m.code), 'javascript')}</pre></div>`
              )
            )
          ).join('')
        : `<div class="rtpg-card-note">no cache generated for this type</div>`;
      // The "transformed src" view is the resolver's real transform of this file.
      const transformed = await transformedSource(op.factory, op.varName, userCode, opts, this.mode, op.options);
      const transformedHtml = `<pre class="rtpg-code">${await this.highlight(transformed, 'typescript')}</pre>`;
      // Drop the result if a newer regeneration started while we awaited — it owns
      // the busy state and will clear it when it finishes.
      if (seq !== this.codeSeq) return;
      this.els.codeHint.textContent = cacheModules.length
        ? `${cacheModules.length} module${cacheModules.length === 1 ? '' : 's'}`
        : '';
      this.els.codeview.innerHTML = html;
      this.els.transformview.innerHTML = transformedHtml;
      this.setCodegenBusy(false);
    } catch (err) {
      if (seq !== this.codeSeq) return;
      const message = `<pre class="rtpg-code error">${escapeHtml((err as Error).message ?? String(err))}</pre>`;
      this.els.codeview.innerHTML = message;
      this.els.transformview.innerHTML = message;
      this.setCodegenBusy(false);
    }
  }
}
