// <runtypes-playground> — a light-DOM custom element wrapping the headless
// engine. Lazy-loads Monaco on connect, renders a type editor + a build-function
// picker + an input/output pane, and runs the chosen function in-browser.
//
// Light DOM (no shadow root) is intentional so Monaco's layout measurement and
// head-injected styles work. Configurable via attributes: `type`, `input`,
// `operation`, `wasm-url`, `wasm-exec-url`. The host may set
// `globalThis.MonacoEnvironment` before connect for full TS language features;
// otherwise a no-op worker keeps the editor usable (the WASM resolver, not
// Monaco, is the source of truth for validation).

import {
  run,
  versions,
  OPERATIONS,
  operationByKey,
  ROOT_TYPE,
  type RunResult,
  type Diagnostic,
  type ResolverOptions,
} from '../core/index.ts';
import {STYLES} from './styles.ts';

type Monaco = typeof import('monaco-editor');
type Editor = import('monaco-editor').editor.IStandaloneCodeEditor;

const SEED_TYPE = `type ${ROOT_TYPE} = {
  id: number;
  name: string;
  tags: string[];
  active?: boolean;
};`;

const SEED_INPUT = `{
  "id": 1,
  "name": "ada",
  "tags": ["math", "code"],
  "active": true
}`;

const EDITOR_DTS = `declare module 'ts-runtypes' {
  export function createValidate<T>(val?: T): (v: unknown) => v is T;
  export function createGetValidationErrors<T>(val?: T): (v: unknown) => unknown[];
  export function createJsonEncoder<T>(val?: T): (v: T) => unknown;
  export function createJsonDecoder<T>(val?: T): (v: unknown) => T;
  export function createBinaryEncoder<T>(val?: T): (v: T) => Uint8Array;
  export function createBinaryDecoder<T>(val?: T): (v: Uint8Array) => T;
  export function getRunTypeId<T>(value?: T): string;
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
  // No-op worker fallback: editing + highlighting work; TS diagnostics need the
  // host to configure real workers (the demo/website do via Vite ?worker).
  scope.MonacoEnvironment = {
    getWorker(): Worker {
      return new Worker(URL.createObjectURL(new Blob([''], {type: 'application/javascript'})));
    },
  };
}

function escapeHtml(text: unknown): string {
  return String(text).replace(/[&<>]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c] as string);
}

function pre(text: string, extraClass = ''): string {
  return `<pre class="rtpg-code ${extraClass}">${escapeHtml(text)}</pre>`;
}

function stringify(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v), 2);
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

function renderResult(result: RunResult): string {
  const diag = renderDiagnostics(result.diagnostics);
  switch (result.kind) {
    case 'predicate':
      return `<div class="rtpg-badge ${result.value ? 'ok' : 'bad'}">${result.value ? 'true ✓' : 'false ✗'}</div>${diag}`;
    case 'errors': {
      const ok = result.value.length === 0;
      const badge = `<div class="rtpg-badge ${ok ? 'ok' : 'bad'}">${ok ? 'valid — no errors' : `${result.value.length} error(s)`}</div>`;
      return `${badge}${ok ? '' : pre(stringify(result.value))}${diag}`;
    }
    case 'encode':
      return `<div class="rtpg-block-label">Encoded (JSON-safe)</div>${pre(stringify(result.value))}${diag}`;
    case 'jsonRoundtrip':
      return `<div class="rtpg-block-label">Encoded</div>${pre(stringify(result.encoded))}<div class="rtpg-block-label">Decoded</div>${pre(stringify(result.decoded))}${diag}`;
    case 'binaryEncode':
      return `<div class="rtpg-block-label">Binary (${result.byteLength} bytes)</div>${pre(result.hex)}${diag}`;
    case 'binaryRoundtrip':
      return `<div class="rtpg-block-label">Binary (${result.byteLength} bytes)</div>${pre(result.hex)}<div class="rtpg-block-label">Decoded</div>${pre(stringify(result.decoded))}${diag}`;
    case 'graph':
      return `<div class="rtpg-block-label">Root id: ${escapeHtml(result.rootId ?? '—')} (${result.runTypes.length} node(s))</div>${pre(stringify(result.runTypes))}${diag}`;
  }
}

export class RuntypesPlaygroundElement extends HTMLElement {
  private typeEditor: Editor | null = null;
  private inputEditor: Editor | null = null;
  private els: Record<string, HTMLElement> = {};
  private booted = false;

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
    const wasmUrl = this.getAttribute('wasm-url') ?? undefined;
    const wasmExecUrl = this.getAttribute('wasm-exec-url') ?? undefined;
    return {wasmUrl, wasmExecUrl};
  }

  private buildDom(): void {
    injectStyles();
    this.classList.add('rt-playground');
    this.innerHTML = `
      <div class="rtpg-layout">
        <section class="rtpg-pane">
          <div class="rtpg-head"><h2>Type</h2><span class="rtpg-hint">define a <code>${ROOT_TYPE}</code></span></div>
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
                <button type="button" class="rtpg-ghost-btn" data-el="fillSample">sample</button></div>
              <div class="rtpg-input-editor" data-el="inputEditor"></div>
            </div>
            <button type="button" class="rtpg-run-btn" data-el="run" disabled>Run</button>
          </div>
        </section>
        <section class="rtpg-pane">
          <div class="rtpg-head"><h2>Output</h2><span class="rtpg-hint" data-el="timing"></span></div>
          <div class="rtpg-output" data-el="output"></div>
        </section>
      </div>`;
    for (const node of Array.from(this.querySelectorAll<HTMLElement>('[data-el]'))) {
      this.els[node.dataset.el as string] = node;
    }
  }

  private async boot(): Promise<void> {
    this.buildDom();
    ensureMonacoWorkers();
    const monaco: Monaco = await import('monaco-editor');

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
      value: this.getAttribute('type') ?? SEED_TYPE,
      language: 'typescript',
      tabSize: 2,
    });
    this.inputEditor = monaco.editor.create(this.els.inputEditor, {
      ...common,
      value: this.getAttribute('input') ?? SEED_INPUT,
      language: 'json',
      lineNumbers: 'off',
    });

    const runKey = monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter;
    this.typeEditor.addCommand(runKey, () => void this.doRun());
    this.inputEditor.addCommand(runKey, () => void this.doRun());

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
    this.els.fillSample.addEventListener('click', () => this.inputEditor?.setValue(SEED_INPUT));
    this.els.run.addEventListener('click', () => void this.doRun());

    try {
      const v = await versions(this.resolverOptions());
      this.setStatus(`resolver v${v.version} · tsgo ${v.tsgo}`, 'ready');
      (this.els.run as HTMLButtonElement).disabled = false;
    } catch (err) {
      this.setStatus(`resolver failed: ${(err as Error).message}`, 'error');
    }
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

  private async doRun(): Promise<void> {
    const op = operationByKey((this.els.operation as HTMLSelectElement).value);
    const userCode = this.typeEditor?.getValue() ?? '';
    let input: unknown;
    if (op.needsInput) {
      try {
        input = JSON.parse(this.inputEditor?.getValue() ?? 'null');
      } catch (err) {
        this.els.output.innerHTML = pre(`Invalid JSON input:\n${(err as Error).message}`, 'error');
        return;
      }
    }
    this.els.output.innerHTML = `<div class="rtpg-placeholder">running…</div>`;
    const started = performance.now();
    try {
      const result = await run(op.key, userCode, input, this.resolverOptions());
      this.els.timing.textContent = `${(performance.now() - started).toFixed(0)} ms`;
      this.els.output.innerHTML = renderResult(result);
    } catch (err) {
      this.els.timing.textContent = '';
      this.els.output.innerHTML = pre((err as Error).message ?? String(err), 'error');
    }
  }
}
