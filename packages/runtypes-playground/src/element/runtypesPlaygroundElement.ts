// <runtypes-playground> — a light-DOM custom element wrapping the headless
// engine. Lazy-loads Monaco on connect and renders a three-column editor:
//   1. Type      — the TypeScript type (or value-first schema) editor.
//   2. Function  — a build-function picker, a JSON input pane with "Random valid"
//                  / "Random invalid" buttons (createMockType + a type-aware
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
  generatedFunction,
  OPERATIONS,
  operationByKey,
  ROOT_TYPE,
  formatsEditorModule,
  type RunResult,
  type Diagnostic,
  type Mode,
  type ResolverOptions,
} from '../core/index.ts';
import {STYLES} from './styles.ts';
import {PRESETS, type Preset} from './presets.ts';
import {TS_ICON, JS_ICON} from './icons.ts';
import {randomTypeDefinition} from './randomType.ts';

type Monaco = typeof import('monaco-editor');
type Editor = import('monaco-editor').editor.IStandaloneCodeEditor;
type PrettierApi = {format: (src: string, opts: Record<string, unknown>) => Promise<string>; plugins: unknown[]};

// Debounce before regenerating the code column: long while typing in the type
// editor, short for a discrete change (function picker / preset / mode).
const TYPE_DEBOUNCE_MS = 2000;
const PICK_DEBOUNCE_MS = 150;

// Ambient declarations so the editor type-checks both forms without imports: the
// createX factories, plus `RT` / `TF` globals for the schema form (loose `any` —
// the WASM resolver, not Monaco, is the source of truth for resolution).
const EDITOR_DTS = `declare module 'ts-runtypes' {
  export function createValidate<T>(val?: T): (v: unknown) => v is T;
  export function createGetValidationErrors<T>(val?: T): (v: unknown) => unknown[];
  export function createJsonEncoder<T>(val?: T): (v: T) => unknown;
  export function createJsonDecoder<T>(val?: T): (v: unknown) => T;
  export function createBinaryEncoder<T>(val?: T): (v: T) => Uint8Array;
  export function createBinaryDecoder<T>(val?: T): (v: Uint8Array) => T;
  export function createMockType<T>(val?: T): () => T;
  export function getRunTypeId<T>(value?: T): string;
}
declare const TF: Record<string, (...args: any[]) => any>;
declare const RT: {
  string(): any; number(): any; boolean(): any;
  literal(v: any): any; array(e: any): any; union(u: any[]): any;
  optional(e: any): any; object(c: Record<string, any>): any;
};`;

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

// Drops the `create` prefix from a factory name for the picker: createValidate -> validate.
function shortLabel(label: string): string {
  const stripped = label.replace(/^create/, '');
  return stripped.charAt(0).toLowerCase() + stripped.slice(1);
}

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

const SPINNER = '<div class="rtpg-loading"><span class="rtpg-spinner"></span>generating…</div>';

export class RuntypesPlaygroundElement extends HTMLElement {
  private monaco: Monaco | null = null;
  private prettier: PrettierApi | null = null;
  private typeEditor: Editor | null = null;
  private inputEditor: Editor | null = null;
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

  // beautify pretty-prints a generated function body with prettier (lazy-loaded).
  // The body has a top-level `return`, so it is wrapped for the parser, then the
  // wrapper line + one indent level are stripped back off.
  private async beautify(code: string): Promise<string> {
    try {
      if (!this.prettier) {
        const [standalone, babel, estree] = await Promise.all([
          import('prettier/standalone'),
          import('prettier/plugins/babel'),
          import('prettier/plugins/estree'),
        ]);
        const plugin = (m: unknown): unknown => (m as {default?: unknown}).default ?? m;
        this.prettier = {format: standalone.format, plugins: [plugin(babel), plugin(estree)]};
      }
      const out = (
        await this.prettier.format(`function __rt() {\n${code}\n}`, {
          parser: 'babel',
          plugins: this.prettier.plugins,
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
        <button type="button" class="rtpg-random-btn" data-el="randomType" title="Generate a random TypeScript type">&#x21bb; Random type</button>
      </div>
      <div class="rtpg-layout">
        <section class="rtpg-pane">
          <div class="rtpg-head"><h2>Type</h2><span class="rtpg-hint" data-el="typeHint">define <code>${ROOT_TYPE}</code></span></div>
          <div class="rtpg-editor" data-el="editor"></div>
        </section>
        <section class="rtpg-pane">
          <div class="rtpg-head"><h2>Function</h2></div>
          <div class="rtpg-controls">
            <label class="rtpg-field">
              <select class="rtpg-select" data-el="operation"></select></label>
            <p class="rtpg-blurb" data-el="blurb"></p>
            <div class="rtpg-field rtpg-input-field" data-el="inputField">
              <div class="rtpg-field-label-row"><span class="rtpg-field-label">Input (JSON)</span>
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
        <section class="rtpg-pane">
          <div class="rtpg-head"><h2>Generated code</h2><span class="rtpg-hint" data-el="codeHint"></span></div>
          <div class="rtpg-codeview" data-el="codeview"><div class="rtpg-placeholder">resolving…</div></div>
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

    const common = {
      theme: 'vs-dark',
      minimap: {enabled: false},
      automaticLayout: true,
      fontSize: 13,
      scrollBeyondLastLine: false,
    } as const;
    this.typeEditor = monaco.editor.create(this.els.editor, {
      ...common,
      value: this.getAttribute('type') ?? PRESETS[0].ts,
      language: 'typescript',
      tabSize: 2,
    });
    this.inputEditor = monaco.editor.create(this.els.inputEditor, {
      ...common,
      value: this.getAttribute('input') ?? PRESETS[0].input,
      language: 'json',
      lineNumbers: 'off',
    });

    const runKey = monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter;
    this.typeEditor.addCommand(runKey, () => void this.doRun());
    this.inputEditor.addCommand(runKey, () => void this.doRun());
    // Typing in the type editor refreshes the generated-code column (debounced,
    // with the spinner showing from the first keystroke).
    this.typeEditor.onDidChangeModelContent(() => this.scheduleCodegen(TYPE_DEBOUNCE_MS));

    this.buildPresets();
    this.buildModeSwitch();

    const select = this.els.operation as HTMLSelectElement;
    for (const op of OPERATIONS) {
      const option = document.createElement('option');
      option.value = op.key;
      option.textContent = shortLabel(op.label);
      select.appendChild(option);
    }
    select.value = this.getAttribute('operation') ?? select.options[0]?.value ?? '';
    this.syncInputVisibility();

    select.addEventListener('change', () => this.onOperationChanged());
    this.els.genRandom.addEventListener('click', () => void this.generateMock());
    this.els.genInvalid.addEventListener('click', () => void this.generateInvalid());
    this.els.run.addEventListener('click', () => void this.doRun());
    this.els.randomType.addEventListener('click', () => void this.randomType());

    try {
      // versions() resolves once Monaco + the resolver WASM are loaded.
      await versions(this.resolverOptions());
      (this.els.run as HTMLButtonElement).disabled = false;
      this.ready = true;
      (this.els.overlay as HTMLElement).hidden = true;
      void this.doRun();
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
    this.scheduleCodegen(PICK_DEBOUNCE_MS);
    if (this.ready) void this.doRun();
  }

  private setMode(mode: Mode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.markActiveMode();
    // Re-show the current preset in the new form so switching always yields a
    // valid snippet (custom edits in the other form are replaced).
    const preset = this.currentPreset();
    this.typeEditor?.setValue(mode === 'schema' ? preset.schema : preset.ts);
    this.scheduleCodegen(PICK_DEBOUNCE_MS);
    if (this.ready) void this.doRun();
  }

  // randomType loads a freshly generated TS type. The generator only emits the
  // TS-type form, so it forces TS-type mode on, deselects the active preset, then
  // refreshes the input (via createMockType), the result, and the generated code.
  private async randomType(): Promise<void> {
    if (!this.ready) return;
    this.mode = 'type';
    this.markActiveMode();
    this.presetIndex = -1;
    this.markActivePreset();
    this.typeEditor?.setValue(randomTypeDefinition());
    this.scheduleCodegen(PICK_DEBOUNCE_MS);
    await this.generateMock();
  }

  private onOperationChanged(): void {
    this.syncInputVisibility();
    this.resetResult();
    this.scheduleCodegen(PICK_DEBOUNCE_MS);
  }

  // resetResult clears the (now stale) run output when the selected function changes.
  private resetResult(): void {
    this.els.output.innerHTML = '<div class="rtpg-placeholder">Run to see the result</div>';
    this.els.timing.textContent = '';
  }

  private syncInputVisibility(): void {
    const op = this.currentOp();
    (this.els.inputField as HTMLElement).hidden = !op.needsInput;
    this.els.blurb.textContent = op.blurb;
  }

  private typeSource(): string {
    return this.typeEditor?.getValue() ?? '';
  }

  // generateInto fills the input pane from a generator (valid mock or negative
  // mock), shows a transient button state, then runs the current function so the
  // result (valid / invalid) is visible immediately.
  private async generateInto(generator: () => Promise<{value: unknown}>, btn: HTMLButtonElement, label: string): Promise<void> {
    if (!this.ready) return;
    btn.disabled = true;
    btn.textContent = 'generating…';
    try {
      const {value} = await generator();
      this.inputEditor?.setValue(stringify(value));
    } catch (err) {
      this.els.output.innerHTML = `<pre class="rtpg-code error">${escapeHtml((err as Error).message ?? String(err))}</pre>`;
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
    void this.doRun();
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
        input = JSON.parse(this.inputEditor?.getValue() ?? 'null');
      } catch (err) {
        this.els.output.innerHTML = `<pre class="rtpg-code error">${escapeHtml(`Invalid JSON input:\n${(err as Error).message}`)}</pre>`;
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
  private async renderResult(result: RunResult): Promise<string> {
    const diag = renderDiagnostics(result.diagnostics);
    const json = async (value: unknown): Promise<string> =>
      `<div class="rtpg-code">${await this.highlight(stringify(value), 'json')}</div>`;
    const label = (text: string): string => `<div class="rtpg-block-label">${text}</div>`;
    switch (result.kind) {
      case 'predicate':
        return `<div class="rtpg-badge ${result.value ? 'ok' : 'bad'}">${result.value ? 'true ✓' : 'false ✗'}</div>${diag}`;
      case 'errors': {
        const ok = result.value.length === 0;
        const badge = `<div class="rtpg-badge ${ok ? 'ok' : 'bad'}">${ok ? 'valid — no errors' : `${result.value.length} error(s)`}</div>`;
        return `${badge}${ok ? '' : await json(result.value)}${diag}`;
      }
      case 'encode':
        return `${label('Encoded (JSON-safe)')}${await json(result.value)}${diag}`;
      case 'jsonRoundtrip':
        return `${label('Encoded')}${await json(result.encoded)}${label('Decoded')}${await json(result.decoded)}${diag}`;
      case 'binaryEncode':
        return `${label(`Binary (${result.byteLength} bytes)`)}<pre class="rtpg-code">${escapeHtml(result.hex)}</pre>${diag}`;
      case 'binaryRoundtrip':
        return `${label(`Binary (${result.byteLength} bytes)`)}<pre class="rtpg-code">${escapeHtml(result.hex)}</pre>${label('Decoded')}${await json(result.decoded)}${diag}`;
      case 'graph':
        return `<div class="rtpg-badge ok">RunType resolved</div>${label(`${result.runTypes.length} node(s) — full graph on the right`)}${diag}`;
    }
  }

  // scheduleCodegen shows the spinner immediately and (re)generates the code column
  // after `delay` ms — long for typing, short for a discrete change.
  private scheduleCodegen(delay: number): void {
    if (this.codeTimer) clearTimeout(this.codeTimer);
    this.els.codeview.innerHTML = SPINNER;
    this.codeTimer = setTimeout(() => void this.updateSelectedCode(), delay);
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
    this.els.codeview.innerHTML = SPINNER;
    try {
      let html: string;
      let hint: string;
      if (op.kind === 'graph') {
        const result = await run('graph', userCode, undefined, opts, this.mode);
        const nodes = result.kind === 'graph' ? result.runTypes : [];
        html = `<pre class="rtpg-code">${await this.highlight(stringify(nodes), 'json')}</pre>`;
        hint = `RunType graph (${nodes.length} nodes)`;
      } else {
        const m = await generatedFunction(op.factory, userCode, opts, this.mode);
        html = m.code
          ? `<pre class="rtpg-code">${await this.highlight(await this.beautify(m.code), 'javascript')}</pre>`
          : `<div class="rtpg-card-note">${escapeHtml(m.note ?? 'no code')}</div>`;
        hint = op.factory;
      }
      // Drop the result if a newer regeneration started while we awaited.
      if (seq !== this.codeSeq) return;
      this.els.codeHint.textContent = hint;
      this.els.codeview.innerHTML = html;
    } catch (err) {
      if (seq !== this.codeSeq) return;
      this.els.codeview.innerHTML = `<pre class="rtpg-code error">${escapeHtml((err as Error).message ?? String(err))}</pre>`;
    }
  }
}
