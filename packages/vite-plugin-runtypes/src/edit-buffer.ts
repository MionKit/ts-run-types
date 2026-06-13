// EditBuffer is the in-house string-editor + source-map generator the
// rewrite uses instead of `magic-string`. It implements ONLY the slice of
// that library the plugin needs (see the method list below), so the
// published package carries zero runtime dependencies.
//
// The rewrite leans on three properties that make a from-scratch editor
// safe here (and let us drop the general-purpose dependency):
//   1. Every edit is expressed against ORIGINAL coordinates — there is no
//      editing of already-edited text — so a single left-to-right render
//      pass is exact and edit *application* order is irrelevant.
//   2. Edits never overlap (sites land on distinct call close-parens;
//      replacements on distinct factory-arg spans). The constructor of the
//      walk asserts this rather than resolving conflicts.
//   3. Every mid-line edit is newline-free; only the prepended import block
//      adds newlines. So the generated file is the original shifted down by
//      the import block's line count, with column shifts confined per line.
//
// The supported API mirrors the magic-string names so the call sites read
// the same: `appendLeft`, `update`, `prepend`, `toString`, `generateMap`.
// The map matches magic-string's `hires: 'boundary'` segmentation (a
// segment at each word/non-word boundary of unedited runs, none inside
// inserted text) so Vite's composite-map chain is unchanged.

// SourceMap is the standard source-map v3 object the plugin hands back to
// Vite. `toString`/`toUrl` mirror magic-string's SourceMap so any consumer
// that serialises the map keeps working (Vite itself reads the fields).
export interface SourceMap {
  version: number;
  file: string | null;
  sources: (string | null)[];
  sourcesContent: (string | null)[];
  names: string[];
  mappings: string;
  toString(): string;
  toUrl(): string;
}

// GenerateMapOptions is the subset of magic-string's generateMap options the
// rewrite passes: the source path, whether to embed the original content,
// and the segmentation granularity.
export interface GenerateMapOptions {
  source?: string;
  includeContent?: boolean;
  hires?: boolean | 'boundary';
}

interface Replacement {
  start: number;
  end: number;
  content: string;
}

// EditBuffer accumulates point insertions (appendLeft) and span
// replacements (update) against an immutable original, plus an optional
// prepended intro, then renders the patched string and a source map.
export class EditBuffer {
  private readonly original: string;
  private intro = '';
  // leftInserts maps an original index to the text inserted immediately to
  // its left; repeated appendLeft at one index accumulate in call order.
  private readonly leftInserts = new Map<number, string>();
  private readonly replacements: Replacement[] = [];

  constructor(original: string) {
    this.original = original;
  }

  // prepend stitches content onto the very front of the output (the import
  // block). Multiple prepends stack with the last one first, matching
  // magic-string; the rewrite only ever calls it once.
  prepend(content: string): this {
    this.intro = content + this.intro;
    return this;
  }

  // appendLeft inserts content immediately to the left of the original
  // index; later calls at the same index land after earlier ones.
  appendLeft(index: number, content: string): this {
    if (!content) return this;
    this.leftInserts.set(index, (this.leftInserts.get(index) ?? '') + content);
    return this;
  }

  // update replaces the original span [start, end) with content.
  update(start: number, end: number, content: string): this {
    if (end < start) throw new Error(`EditBuffer.update: end ${end} < start ${start}`);
    this.replacements.push({start, end, content});
    return this;
  }

  // toString renders the patched source: the intro, then the original woven
  // with its insertions and replacements.
  toString(): string {
    let out = this.intro;
    this.eachChunk(
      (start, end) => (out += this.original.slice(start, end)),
      (text) => (out += text),
      (_start, _end, text) => (out += text)
    );
    return out;
  }

  // generateMap produces a source-map v3 object relocating every generated
  // position back to the original. Boundary segmentation keeps the map
  // small while still re-anchoring columns past each inserted run.
  generateMap(options: GenerateMapOptions = {}): SourceMap {
    const hires = options.hires ?? false;
    const locate = makeLocator(this.original);
    const mappings = new Mappings(this.original, hires, locate);
    if (this.intro) mappings.advance(this.intro);
    this.eachChunk(
      (start, end) => mappings.addUnedited(start, end),
      (text) => mappings.advance(text),
      (start, _end, text) => mappings.addEdited(start, text)
    );
    const source = options.source ?? null;
    return new RtSourceMap(null, [source], [options.includeContent ? this.original : null], mappings.encode());
  }

  // eachChunk walks the document left to right, emitting verbatim copies
  // (onCopy), inserted text with no source origin (onInsert), and replaced
  // spans (onEdit). A left-insert at an index is the "outro" of the chunk
  // ending there, so it fires after that chunk's content and before any
  // replacement starting at the same index — matching magic-string's order.
  private eachChunk(
    onCopy: (start: number, end: number) => void,
    onInsert: (text: string) => void,
    onEdit: (start: number, end: number, text: string) => void
  ): void {
    const replacements = [...this.replacements].sort((a, b) => a.start - b.start);
    const insertPositions = [...this.leftInserts.keys()].sort((a, b) => a - b);
    this.assertDisjoint(replacements, insertPositions);

    const length = this.original.length;
    let cursor = 0;
    let nextInsert = 0;
    let nextReplacement = 0;
    while (cursor < length || nextInsert < insertPositions.length || nextReplacement < replacements.length) {
      const insertAt = nextInsert < insertPositions.length ? insertPositions[nextInsert] : Infinity;
      const replaceAt = nextReplacement < replacements.length ? replacements[nextReplacement].start : Infinity;
      const at = Math.min(insertAt, replaceAt);
      if (at === Infinity) {
        if (cursor < length) onCopy(cursor, length);
        break;
      }
      if (at > cursor) {
        onCopy(cursor, at);
        cursor = at;
      }
      if (insertAt === at) {
        onInsert(this.leftInserts.get(at)!);
        nextInsert++;
      }
      if (replaceAt === at) {
        const replacement = replacements[nextReplacement];
        onEdit(replacement.start, replacement.end, replacement.content);
        cursor = replacement.end;
        nextReplacement++;
      }
    }
  }

  // assertDisjoint guards the non-overlap invariant the single-pass render
  // relies on: replacements may not overlap, and no insertion may fall
  // strictly inside a replaced span. Both are structural impossibilities in
  // the rewrite's edit set — a violation means a resolver/protocol bug.
  private assertDisjoint(replacements: Replacement[], insertPositions: number[]): void {
    for (let i = 1; i < replacements.length; i++) {
      if (replacements[i].start < replacements[i - 1].end) {
        throw new Error(`EditBuffer: overlapping replacements at ${replacements[i - 1].start} and ${replacements[i].start}`);
      }
    }
    for (const position of insertPositions) {
      for (const replacement of replacements) {
        if (position > replacement.start && position < replacement.end) {
          throw new Error(
            `EditBuffer: insertion at ${position} falls inside replacement [${replacement.start}, ${replacement.end})`
          );
        }
      }
    }
  }
}

// Mappings builds the decoded segment grid (one row per generated line, each
// segment [generatedColumn, sourceIndex, originalLine, originalColumn]) and
// VLQ-encodes it. The advance/addUnedited/addEdited split mirrors
// magic-string's Mappings so boundary segmentation and edited-chunk
// anchoring match exactly.
class Mappings {
  private generatedLine = 0;
  private generatedColumn = 0;
  private readonly rows: number[][][] = [[]];

  constructor(
    private readonly original: string,
    private readonly hires: boolean | 'boundary',
    private readonly locate: (index: number) => {line: number; column: number}
  ) {}

  // advance bumps the generated cursor past emitted-but-unmapped text (the
  // intro and inserted runs) without recording any segment.
  advance(text: string): void {
    if (!text) return;
    const lines = text.split('\n');
    if (lines.length > 1) {
      for (let i = 0; i < lines.length - 1; i++) this.rows[++this.generatedLine] = [];
      this.generatedColumn = 0;
    }
    this.generatedColumn += lines[lines.length - 1].length;
  }

  // addUnedited maps a verbatim run [start, end) of the original, emitting a
  // segment per word/non-word boundary (hires 'boundary') and tracking the
  // original line/column as it walks, splitting generated lines on newlines.
  // A newline does NOT get its own segment — it just opens the next line —
  // matching magic-string's addUneditedChunk.
  addUnedited(start: number, end: number): void {
    const loc = this.locate(start);
    let originalLine = loc.line;
    let originalColumn = loc.column;
    let atLineStart = true;
    let inWordRun = false;
    for (let index = start; index < end; index++) {
      const char = this.original[index];
      if (char === '\n') {
        originalLine++;
        originalColumn = 0;
        this.rows[++this.generatedLine] = [];
        this.generatedColumn = 0;
        atLineStart = true;
        inWordRun = false;
        continue;
      }
      if (this.hires || atLineStart) {
        const segment = [this.generatedColumn, 0, originalLine, originalColumn];
        if (this.hires === 'boundary') {
          if (isWordChar(char)) {
            if (!inWordRun) {
              this.rows[this.generatedLine].push(segment);
              inWordRun = true;
            }
          } else {
            this.rows[this.generatedLine].push(segment);
            inWordRun = false;
          }
        } else {
          this.rows[this.generatedLine].push(segment);
        }
      }
      originalColumn++;
      this.generatedColumn++;
      atLineStart = false;
    }
  }

  // addEdited maps replaced content: a segment at each generated line start
  // (all pointing at the original start of the replaced span), then the
  // generated cursor advances past the trailing partial line. Mirrors
  // magic-string's addEdit; our replacements are single-line in practice, so
  // only the final push + advance run, but the multi-line path stays faithful.
  addEdited(start: number, content: string): void {
    if (!content) return;
    const loc = this.locate(start);
    const contentLengthMinusOne = content.length - 1;
    let contentLineEnd = content.indexOf('\n', 0);
    let previousContentLineEnd = -1;
    while (contentLineEnd >= 0 && contentLengthMinusOne > contentLineEnd) {
      this.rows[this.generatedLine].push([this.generatedColumn, 0, loc.line, loc.column]);
      this.rows[++this.generatedLine] = [];
      this.generatedColumn = 0;
      previousContentLineEnd = contentLineEnd;
      contentLineEnd = content.indexOf('\n', contentLineEnd + 1);
    }
    this.rows[this.generatedLine].push([this.generatedColumn, 0, loc.line, loc.column]);
    this.advance(content.slice(previousContentLineEnd + 1));
  }

  // encode delta-VLQ-encodes the segment grid into the `mappings` string.
  encode(): string {
    let previousSource = 0;
    let previousOriginalLine = 0;
    let previousOriginalColumn = 0;
    return this.rows
      .map((row) => {
        let previousGeneratedColumn = 0;
        return row
          .map((segment) => {
            let encoded = encodeVlq(segment[0] - previousGeneratedColumn);
            previousGeneratedColumn = segment[0];
            encoded += encodeVlq(segment[1] - previousSource);
            previousSource = segment[1];
            encoded += encodeVlq(segment[2] - previousOriginalLine);
            previousOriginalLine = segment[2];
            encoded += encodeVlq(segment[3] - previousOriginalColumn);
            previousOriginalColumn = segment[3];
            return encoded;
          })
          .join(',');
      })
      .join(';');
  }
}

// RtSourceMap is the concrete map object. Methods live on the prototype so
// JSON.stringify only serialises the data fields.
class RtSourceMap implements SourceMap {
  readonly version = 3;
  constructor(
    readonly file: string | null,
    readonly sources: (string | null)[],
    readonly sourcesContent: (string | null)[],
    readonly mappings: string,
    readonly names: string[] = []
  ) {}

  toString(): string {
    return JSON.stringify(this);
  }

  toUrl(): string {
    return 'data:application/json;charset=utf-8;base64,' + Buffer.from(this.toString()).toString('base64');
  }
}

const VLQ_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// encodeVlq base64-VLQ-encodes a single signed integer (sign in the LSB),
// the inverse of the decoder in test/helpers/sourcemap.ts.
function encodeVlq(value: number): string {
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1;
  let encoded = '';
  do {
    let digit = vlq & 31;
    vlq >>>= 5;
    if (vlq > 0) digit |= 32;
    encoded += VLQ_CHARS[digit];
  } while (vlq > 0);
  return encoded;
}

// isWordChar matches magic-string's boundary regex (/\w/): ASCII letters,
// digits, and underscore.
function isWordChar(char: string): boolean {
  return /\w/.test(char);
}

// makeLocator returns an original-index -> {line, column} resolver backed by
// a precomputed line-start table (binary search). Columns are UTF-16 code
// units, matching the char indices the rewrite passes in.
function makeLocator(source: string): (index: number) => {line: number; column: number} {
  const lineStarts = [0];
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '\n') lineStarts.push(index + 1);
  }
  return (index: number) => {
    let low = 0;
    let high = lineStarts.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (lineStarts[mid] <= index) low = mid;
      else high = mid - 1;
    }
    return {line: low, column: index - lineStarts[low]};
  };
}
