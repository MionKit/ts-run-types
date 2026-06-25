// End-to-end HMR dev-loop test for the enrich-mirror reconciler (Layer 2).
//
// The reconcile is the `ts-runtypes gen --update` op a dev-loop save handler
// invokes on every source change. This test SIMULATES that loop against the
// real binary on a real temp project: it writes a real source `.ts`, runs the
// real reconcile, and repeats over a sequence of consecutive edits — the
// half-typed terrain a save-on-keystroke loop actually produces.
//
// It pins the two properties that matter for the dev loop:
//   1. ONE-DIRECTIONAL — updates flow types -> generated file ONLY. The reconcile
//      writes the mirror and NEVER touches the source.
//   2. NO GARBAGE AFTER CONSECUTIVE CHANGES — after a run of edits the mirror
//      CONVERGES: a further reconcile with no source change is a byte-identical
//      no-op (the file stabilises, it does not churn or accrete), authored data
//      is never lost (it stays live or rides a prunable @rtOrphan carcass), and
//      every reconcile leaves a parseable mirror (a successful exit proves the
//      reconcile re-parsed it).
//
// Where Layer 1 (internal/enrich/mirror property test) drives Reconcile with a
// SYNTHETIC desired set, this layer exercises the REAL compiler -> reconcile ->
// disk pipeline end to end, so the structural ids, closure grouping and atomic
// write are all the production ones.
import {describe, it, expect} from 'vitest';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {BIN, hasBinary} from './helpers/inline.ts';

type FieldType = 'string' | 'number' | 'boolean';
interface Field {
  key: string;
  type: FieldType;
}

interface Project {
  dir: string;
  src: string;
  genDir: string;
  mirror: string;
}

const TSCONFIG = JSON.stringify({
  compilerOptions: {strict: true, module: 'esnext', target: 'esnext', moduleResolution: 'bundler'},
  include: ['src'],
});

function renderSource(fields: Field[]): string {
  const body = fields.map((field) => `  ${field.key}: ${field.type};`).join('\n');
  return `export interface User {\n${body}\n}\n`;
}

function setupProject(fields: Field[]): Project {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-hmr-'));
  fs.mkdirSync(path.join(dir, 'src'));
  fs.writeFileSync(path.join(dir, 'tsconfig.json'), TSCONFIG);
  const src = path.join(dir, 'src', 'models.ts');
  fs.writeFileSync(src, renderSource(fields));
  const genDir = path.join(dir, 'generated');
  return {dir, src, genDir, mirror: path.join(genDir, 'src', 'models.ts')};
}

// genUpdate runs the real reconcile (the op a dev-loop save handler fires).
function genUpdate(project: Project): {status: number; output: string} {
  const result = spawnSync(BIN, ['gen', project.src, 'User', '--update', '--enrich-dir', project.genDir], {
    encoding: 'utf8',
  });
  return {status: result.status ?? -1, output: (result.stdout ?? '') + (result.stderr ?? '')};
}

// writeSource models one keystroke-burst save: it writes the new source and
// returns the exact bytes written, so the caller can assert the reconcile left
// the source untouched (the one-directional invariant).
function writeSource(project: Project, fields: Field[]): string {
  const text = renderSource(fields);
  fs.writeFileSync(project.src, text);
  return text;
}

// mulberry32: a tiny seeded PRNG so a failing random sequence is reproducible.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// runRandomSequence drives one seeded run of `steps` consecutive edits, asserting
// the invariants after every edit and convergence at the end.
function runRandomSequence(seed: number, steps: number): void {
  const rng = mulberry32(seed);
  let counter = 0;
  const freshKey = (): string => `f${seed}_${counter++}`;
  const types: readonly FieldType[] = ['string', 'number', 'boolean'];
  const randType = (): FieldType => types[Math.floor(rng() * types.length)];

  const fields: Field[] = [
    {key: freshKey(), type: 'string'},
    {key: freshKey(), type: 'number'},
  ];
  const project = setupProject(fields);
  try {
    expect(genUpdate(project).status, `seed ${seed}: seed reconcile`).toBe(0);

    // The user authors a value: set the friendly root $label (always-live node
    // meta, so it must survive every edit) to a unique sentinel.
    const sentinel = `AUTH_${seed}`;
    let mirror = fs.readFileSync(project.mirror, 'utf8');
    expect(mirror, `seed ${seed}: unexpected seed mirror shape`).toContain("$label: ''");
    fs.writeFileSync(project.mirror, mirror.replace("$label: ''", `$label: '${sentinel}'`));

    for (let step = 0; step < steps; step++) {
      const choice = Math.floor(rng() * 4);
      if (choice === 0) {
        fields[Math.floor(rng() * fields.length)].key = freshKey(); // rename a field
      } else if (choice === 1) {
        fields.push({key: freshKey(), type: randType()}); // add a field
      } else if (choice === 2 && fields.length > 1) {
        fields.splice(Math.floor(rng() * fields.length), 1); // delete a field
      } else {
        const i = Math.floor(rng() * fields.length); // change a field's type
        let next = fields[i].type;
        while (next === fields[i].type) next = randType();
        fields[i].type = next;
      }

      const written = writeSource(project, fields);
      const result = genUpdate(project);
      expect(result.status, `seed ${seed} step ${step}: reconcile failed\n${result.output}`).toBe(0);

      // One-directional: the reconcile never writes the source.
      expect(fs.readFileSync(project.src, 'utf8'), `seed ${seed} step ${step}: source was modified`).toBe(written);
      // No data loss: the authored value is still somewhere in the mirror.
      mirror = fs.readFileSync(project.mirror, 'utf8');
      expect(mirror, `seed ${seed} step ${step}: authored value lost`).toContain(sentinel);
    }

    // Convergence: a further reconcile with no source change is a byte-identical
    // no-op — the file has stabilised, no garbage is still being churned in.
    const before = fs.readFileSync(project.mirror, 'utf8');
    expect(genUpdate(project).status, `seed ${seed}: convergence reconcile`).toBe(0);
    expect(fs.readFileSync(project.mirror, 'utf8'), `seed ${seed}: not converged`).toBe(before);
  } finally {
    fs.rmSync(project.dir, {recursive: true, force: true});
  }
}

const describeIfBinary = hasBinary() ? describe : describe.skip;

describeIfBinary('enrich-mirror HMR dev loop (E2E)', () => {
  it('updates flow types -> mirror only, converge, and preserve authored data', () => {
    const project = setupProject([
      {key: 'name', type: 'string'},
      {key: 'age', type: 'number'},
    ]);
    try {
      expect(genUpdate(project).status, 'seed reconcile').toBe(0);

      // Author the friendly root label AND a field label.
      let mirror = fs.readFileSync(project.mirror, 'utf8');
      mirror = mirror.replace("$label: ''", "$label: 'AUTH_ROOT'");
      mirror = mirror.replace("name: {$label: ''", "name: {$label: 'AUTH_NAME'");
      fs.writeFileSync(project.mirror, mirror);
      expect(mirror).toContain('AUTH_ROOT');
      expect(mirror).toContain('AUTH_NAME');

      // A run of consecutive edits: rename a field, add a field, change a type.
      const sequence: Field[][] = [
        [
          {key: 'name', type: 'string'},
          {key: 'years', type: 'number'},
        ],
        [
          {key: 'name', type: 'string'},
          {key: 'years', type: 'number'},
          {key: 'email', type: 'string'},
        ],
        [
          {key: 'name', type: 'number'},
          {key: 'years', type: 'number'},
          {key: 'email', type: 'string'},
        ],
      ];
      for (const fields of sequence) {
        const written = writeSource(project, fields);
        expect(genUpdate(project).status).toBe(0);
        expect(fs.readFileSync(project.src, 'utf8'), 'source must be untouched by the reconcile').toBe(written);
        mirror = fs.readFileSync(project.mirror, 'utf8');
        expect(mirror, 'authored root label lost').toContain('AUTH_ROOT');
        expect(mirror, 'authored field value lost').toContain('AUTH_NAME');
      }

      // Convergence: an extra reconcile with no source change is a no-op.
      const before = fs.readFileSync(project.mirror, 'utf8');
      expect(genUpdate(project).status).toBe(0);
      expect(fs.readFileSync(project.mirror, 'utf8'), 'mirror must converge (no churn)').toBe(before);
    } finally {
      fs.rmSync(project.dir, {recursive: true, force: true});
    }
  }, 60_000);

  it('produces no garbage after many consecutive random edits (seeded, reproducible)', () => {
    for (const seed of [1, 2]) {
      runRandomSequence(seed, 8);
    }
  }, 120_000);

  it('a field rename typed one keystroke at a time carries the value with no orphan trail', () => {
    // The reconciler tracks a field by its TYPE identity (@rtIds child id), not
    // its name, so renaming a field through its half-typed intermediate states
    // (one reconcile per keystroke) must carry the authored value the whole way
    // and NEVER leave a carcass behind — no "two entries" for one rename. `age`
    // is a number distractor so the string-field rename is always unambiguous.
    const project = setupProject([
      {key: 'title', type: 'string'},
      {key: 'age', type: 'number'},
    ]);
    try {
      expect(genUpdate(project).status).toBe(0);
      let mirror = fs.readFileSync(project.mirror, 'utf8');
      fs.writeFileSync(project.mirror, mirror.replace("title: {$label: ''", "title: {$label: 'AUTH_TITLE'"));

      // Type `title` -> `heading`, one character per save, reconciling each time.
      const keystrokes = ['titl', 'tit', 'ti', 't', 'th', 'the', 'thea', 'head', 'headi', 'headin', 'heading'];
      for (const key of keystrokes) {
        writeSource(project, [
          {key, type: 'string'},
          {key: 'age', type: 'number'},
        ]);
        expect(genUpdate(project).status, `keystroke '${key}': reconcile failed`).toBe(0);
        mirror = fs.readFileSync(project.mirror, 'utf8');
        expect(mirror, `keystroke '${key}': an in-place rename must not leave an @rtOrphan carcass`).not.toContain('@rtOrphan');
        expect(
          mirror.split('AUTH_TITLE').length - 1,
          `keystroke '${key}': the authored value must be carried exactly once (no empty twin)`
        ).toBe(1);
      }

      // The value ends up on the renamed field; the old name is gone entirely.
      mirror = fs.readFileSync(project.mirror, 'utf8');
      expect(mirror).toContain("heading: {$label: 'AUTH_TITLE'");
      expect(mirror).not.toContain('title:');
    } finally {
      fs.rmSync(project.dir, {recursive: true, force: true});
    }
  }, 60_000);
});
