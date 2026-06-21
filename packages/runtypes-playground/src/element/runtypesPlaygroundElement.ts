// <runtypes-playground> — a light-DOM custom element wrapping the headless
// engine. Lazy-loads Monaco on connect and renders:
//   - a preset picker + a TS-type / Schema mode switch above the type editor,
//   - the type editor, a build-function picker, and a JSON input pane whose
//     "Generate random" button fills it from createMockType (a RunTypes feature),
//   - a syntax-highlighted output pane,
//   - a "Generated functions" section: the code RunTypes generates per family,
//     one card each, syntax-highlighted.
//
// Light DOM (no shadow root) is intentional so Monaco's layout measurement and
// head-injected styles work. Highlighting reuses Monaco's own colorizer (no extra
// dependency, same theme as the editors). Configurable via attributes: `type`,
// `input`, `operation`, `mode`, `wasm-url`, `wasm-exec-url`.

import {
  run,
  mock,
  versions,
  generatedModules,
  OPERATIONS,
  operationByKey,
  ROOT_TYPE,
  type RunResult,
  type Diagnostic,
  type GeneratedModule,
  type Mode,
  type ResolverOptions,
} from '../core/index.ts';
import {STYLES} from './styles.ts';
import {PRESETS, type Preset} from './presets.ts';

type Monaco = typeof import('monaco-editor');
type Editor = import('monaco-editor').editor.IStandaloneCodeEditor;

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
declare const TF: {string(): any; number(): any; boolean(): any};
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
  private typeEditor: Editor | null = null;
  private inputEditor: Editor | null = null;
  private els: Record<string, HTMLElement> = {};
  private booted = false;
  private ready = false;
  private mode: Mode = 'type';
  private presetIndex = 0;
  private codeTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.syncInputVisibility();
  }
  runNow(): Promise<void> {
    return this.doRun();
  }
  get outputText(): string {
    return this.els.output?.textContent ?? '';
  }

  private resolverOptions(): ResolverOptions {
    return {wasmUrl: this.getAttribute('wasm-url') ?? undefined, wasmExecUrl: this.getAttribute('wasm-exec-url') ?? undefined};
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

  private buildDom(): void {
    injectStyles();
    this.classList.add('rt-playground');
    this.innerHTML = `
      <div class="rtpg-toolbar">
        <div class="rtpg-presets" data-el="presets"></div>
        <div class="rtpg-modeswitch" role="group" aria-label="type form">
          <button type="button" class="rtpg-mode" data-mode="type" title="TypeScript type">TS type</button>
          <button type="button" class="rtpg-mode" data-mode="schema" title="ts-runtypes schema (value-first)">Schema</button>
        </div>
      </div>
      <div class="rtpg-layout">
        <section class="rtpg-pane">
          <div class="rtpg-head"><h2>Type</h2><span class="rtpg-hint" data-el="typeHint">define <code>${ROOT_TYPE}</code></span></div>
          <div class="rtpg-editor" data-el="editor"></div>
        </section>
        <section class="rtpg-pane">
          <div class="rtpg-head"><h2>Build function</h2><span class="rtpg-status" data-el="status" data-state="loading">loading…</span></div>
          <div class="rtpg-controls">
            <label class="rtpg-field"><span class="rtpg-field-label">Function</span>
              <select class="rtpg-select" data-el="operation"></select></label>
            <p class="rtpg-blurb" data-el="blurb"></p>
            <div class="rtpg-field rtpg-input-field" data-el="inputField">
              <div class="rtpg-field-label-row"><span class="rtpg-field-label">Input (JSON)</span>
                <button type="button" class="rtpg-ghost-btn" data-el="genRandom" title="Generate a random value with createMockType">Generate random</button></div>
              <div class="rtpg-input-editor" data-el="inputEditor"></div>
              <div class="rtpg-mock-badge" data-el="mockBadge">Sample data generated by RunTypes <code>createMockType&lt;${ROOT_TYPE}&gt;()</code></div>
            </div>
            <button type="button" class="rtpg-run-btn" data-el="run" disabled>Run</button>
          </div>
        </section>
        <section class="rtpg-pane">
          <div class="rtpg-head"><h2>Output</h2><span class="rtpg-hint" data-el="timing"></span></div>
          <div class="rtpg-output" data-el="output"></div>
        </section>
      </div>
      <section class="rtpg-codegen">
        <div class="rtpg-codegen-head"><h2>Generated functions</h2><span class="rtpg-hint">the code RunTypes generates for this type, one card per family</span></div>
        <div class="rtpg-cards" data-el="cards"></div>
      </section>`;
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
    // The generated code depends only on the type — refresh it (debounced) on edit.
    this.typeEditor.onDidChangeModelContent(() => this.scheduleCodegen());

    this.buildPresets();
    this.buildModeSwitch();

    const select = this.els.operation as HTMLSelectElement;
    for (const op of OPERATIONS) {
      const option = document.createElement('option');
      option.value = op.key;
      option.textContent = op.label;
      select.appendChild(option);
    }
    select.value = this.getAttribute('operation') ?? OPERATIONS[0].key;
    this.syncInputVisibility();

    select.addEventListener('change', () => this.syncInputVisibility());
    this.els.genRandom.addEventListener('click', () => void this.generateMock());
    this.els.run.addEventListener('click', () => void this.doRun());

    try {
      const v = await versions(this.resolverOptions());
      this.setStatus(`resolver v${v.version} · tsgo ${v.tsgo}`, 'ready');
      (this.els.run as HTMLButtonElement).disabled = false;
      this.ready = true;
      void this.updateGeneratedCode();
    } catch (err) {
      this.setStatus(`resolver failed: ${(err as Error).message}`, 'error');
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
    void this.updateGeneratedCode();
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
    void this.updateGeneratedCode();
    if (this.ready) void this.doRun();
  }

  private setStatus(text: string, state: string): void {
    this.els.status.textContent = text;
    this.els.status.dataset.state = state;
  }

  private syncInputVisibility(): void {
    const op = operationByKey((this.els.operation as HTMLSelectElement).value);
    (this.els.inputField as HTMLElement).hidden = !op.needsInput;
    this.els.blurb.textContent = op.blurb;
  }

  private typeSource(): string {
    return this.typeEditor?.getValue() ?? '';
  }

  // generateMock fills the input pane with a fresh random value from createMockType.
  private async generateMock(): Promise<void> {
    if (!this.ready) return;
    const btn = this.els.genRandom as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = 'generating…';
    try {
      const {value} = await mock(this.typeSource(), this.resolverOptions(), this.mode);
      this.inputEditor?.setValue(stringify(value));
    } catch (err) {
      this.els.output.innerHTML = `<pre class="rtpg-code error">${escapeHtml((err as Error).message ?? String(err))}</pre>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Generate random';
    }
  }

  private async doRun(): Promise<void> {
    if (!this.ready) return;
    const op = operationByKey((this.els.operation as HTMLSelectElement).value);
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
        return `${label(`Root id: ${escapeHtml(result.rootId ?? '—')} (${result.runTypes.length} node(s))`)}${await json(result.runTypes)}${diag}`;
    }
  }

  private scheduleCodegen(): void {
    if (this.codeTimer) clearTimeout(this.codeTimer);
    this.codeTimer = setTimeout(() => void this.updateGeneratedCode(), 400);
  }

  // updateGeneratedCode renders one card per family with the generated function
  // source for the current type, syntax-highlighted.
  private async updateGeneratedCode(): Promise<void> {
    if (!this.ready) return;
    const cards = this.els.cards;
    const userCode = this.typeSource();
    let modules: GeneratedModule[];
    try {
      modules = await generatedModules(userCode, this.resolverOptions(), this.mode);
    } catch (err) {
      cards.innerHTML = `<pre class="rtpg-code error">${escapeHtml((err as Error).message ?? String(err))}</pre>`;
      return;
    }
    const html = await Promise.all(
      modules.map(async (m) => {
        const body = m.code
          ? `<pre class="rtpg-code">${await this.highlight(m.code, 'javascript')}</pre>`
          : `<div class="rtpg-card-note">${escapeHtml(m.note ?? 'no code')}</div>`;
        return `<div class="rtpg-card"><div class="rtpg-card-head">${escapeHtml(m.factory)}</div>${body}</div>`;
      })
    );
    cards.innerHTML = html.join('');
  }
}
