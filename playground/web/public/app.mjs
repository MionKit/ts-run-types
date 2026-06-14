// app.mjs — UI wiring for the standalone playground. Sets up the Monaco type
// editor + JSON input editor, the build-function picker, and renders the result
// of running the chosen function (resolved + executed in-browser via core.mjs).

import { OPERATIONS, operationByKey, run, versions, ROOT_TYPE } from './core.mjs';

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

// Ambient marker declaration so the editor resolves `import … from 'ts-runtypes'`
// and offers the factories, mirroring the public API.
const EDITOR_DTS = `declare module 'ts-runtypes' {
  export type InjectRunTypeId<T> = string;
  export type InjectTypeFnArgs<T, F extends string> = string;
  /** Build a type guard for T. */
  export function createValidate<T>(val?: T): (v: unknown) => v is T;
  /** Build a function returning T's validation errors. */
  export function createGetValidationErrors<T>(val?: T): (v: unknown) => unknown[];
  export function createJsonEncoder<T>(val?: T): (v: T) => unknown;
  export function createJsonDecoder<T>(val?: T): (v: unknown) => T;
  export function createBinaryEncoder<T>(val?: T): (v: T) => Uint8Array;
  export function createBinaryDecoder<T>(val?: T): (v: Uint8Array) => T;
  export function getRunTypeId<T>(value?: T): string;
}`;

const el = {
  status: document.getElementById('status'),
  operation: document.getElementById('operation'),
  blurb: document.getElementById('op-blurb'),
  inputField: document.getElementById('input-field'),
  fillSample: document.getElementById('fill-sample'),
  run: document.getElementById('run'),
  output: document.getElementById('output'),
  timing: document.getElementById('timing'),
};

let typeEditor = null;
let inputEditor = null;

function setStatus(text, state) {
  el.status.textContent = text;
  el.status.dataset.state = state;
}

function escapeHtml(text) {
  return String(text).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

function pre(text, extraClass = '') {
  return `<pre class="code ${extraClass}">${escapeHtml(text)}</pre>`;
}

function stringify(value) {
  return JSON.stringify(value, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v), 2);
}

function renderDiagnostics(diagnostics) {
  if (!diagnostics || diagnostics.length === 0) return '';
  const items = diagnostics
    .map((d) => {
      const severity = String(d.severity ?? d.Severity ?? '').toLowerCase();
      const code = d.code ?? d.Code ?? '';
      const message = d.message ?? d.Message ?? '';
      return `<div class="diag-item ${severity}">${escapeHtml(`${severity.toUpperCase()} ${code}: ${message}`)}</div>`;
    })
    .join('');
  return `<div class="diag"><div class="block-label">Diagnostics</div>${items}</div>`;
}

function render(result) {
  const diag = renderDiagnostics(result.diagnostics);
  switch (result.kind) {
    case 'predicate': {
      const ok = result.value;
      return `<div class="result-badge ${ok ? 'ok' : 'bad'}">${ok ? 'true ✓' : 'false ✗'}</div>${diag}`;
    }
    case 'errors': {
      const errs = result.value ?? [];
      const ok = errs.length === 0;
      const badge = `<div class="result-badge ${ok ? 'ok' : 'bad'}">${ok ? 'valid — no errors' : `${errs.length} error(s)`}</div>`;
      const body = ok ? '' : pre(stringify(errs));
      return `${badge}${body}${diag}`;
    }
    case 'encode':
      return `<div class="block-label">Encoded (JSON-safe)</div>${pre(stringify(result.value))}${diag}`;
    case 'jsonRoundtrip':
      return `<div class="block-label">Encoded</div>${pre(stringify(result.encoded))}<div class="block-label">Decoded</div>${pre(stringify(result.decoded))}${diag}`;
    case 'binaryEncode':
      return `<div class="block-label">Binary (${result.byteLength} bytes)</div>${pre(result.hex)}${diag}`;
    case 'binaryRoundtrip':
      return `<div class="block-label">Binary (${result.byteLength} bytes)</div>${pre(result.hex)}<div class="block-label">Decoded</div>${pre(stringify(result.decoded))}${diag}`;
    case 'graph': {
      const head = `<div class="block-label">Root id: ${escapeHtml(result.rootId ?? '—')} (${result.runTypes.length} node(s))</div>`;
      return `${head}${pre(stringify(result.runTypes))}${diag}`;
    }
    default:
      return pre(stringify(result));
  }
}

async function doRun() {
  const op = operationByKey(el.operation.value);
  const userCode = typeEditor.getValue();
  let input;
  if (op.needsInput) {
    try {
      input = JSON.parse(inputEditor.getValue());
    } catch (err) {
      el.output.innerHTML = pre(`Invalid JSON input:\n${err.message}`, 'error');
      return;
    }
  }
  el.output.innerHTML = `<div class="placeholder">running…</div>`;
  const started = performance.now();
  try {
    const result = await run(op.key, userCode, input);
    el.timing.textContent = `${(performance.now() - started).toFixed(0)} ms`;
    el.output.innerHTML = render(result);
  } catch (err) {
    el.timing.textContent = '';
    el.output.innerHTML = pre(err.message ?? String(err), 'error');
  }
}

function syncInputVisibility() {
  const op = operationByKey(el.operation.value);
  el.inputField.hidden = !op.needsInput;
  el.blurb.textContent = op.blurb;
}

async function boot() {
  const monaco = await window.__monacoReady;

  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    strict: true,
    noEmit: true,
  });
  monaco.languages.typescript.typescriptDefaults.addExtraLib(EDITOR_DTS, 'file:///node_modules/ts-runtypes/index.d.ts');

  typeEditor = monaco.editor.create(document.getElementById('editor'), {
    value: SEED_TYPE,
    language: 'typescript',
    theme: 'vs-dark',
    minimap: { enabled: false },
    automaticLayout: true,
    fontSize: 13,
    scrollBeyondLastLine: false,
    tabSize: 2,
  });

  inputEditor = monaco.editor.create(document.getElementById('input-editor'), {
    value: SEED_INPUT,
    language: 'json',
    theme: 'vs-dark',
    minimap: { enabled: false },
    automaticLayout: true,
    fontSize: 13,
    lineNumbers: 'off',
    scrollBeyondLastLine: false,
  });

  // Ctrl/Cmd+Enter runs from either editor.
  const runKey = monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter;
  typeEditor.addCommand(runKey, () => doRun());
  inputEditor.addCommand(runKey, () => doRun());

  // Populate the build-function picker.
  for (const op of OPERATIONS) {
    const option = document.createElement('option');
    option.value = op.key;
    option.textContent = op.label;
    el.operation.appendChild(option);
  }
  el.operation.value = OPERATIONS[0].key;
  syncInputVisibility();

  el.operation.addEventListener('change', syncInputVisibility);
  el.fillSample.addEventListener('click', () => inputEditor.setValue(SEED_INPUT));
  el.run.addEventListener('click', doRun);

  // Load the resolver; enable Run once ready.
  try {
    const v = await versions();
    setStatus(`resolver v${v.version} · tsgo ${v.tsgo}`, 'ready');
    el.run.disabled = false;
  } catch (err) {
    setStatus(`resolver failed: ${err.message}`, 'error');
  }
}

boot().catch((err) => {
  setStatus(`init failed: ${err.message}`, 'error');
  // eslint-disable-next-line no-console
  console.error(err);
});
