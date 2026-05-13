// Wrapping test — verifies that user-defined generic helpers whose trailing
// parameter is `RuntypeId<T>` get the same compile-time id injection as
// `getRuntypeId` itself, and that a same-named-but-non-mion-package
// `RuntypeId<T>` is correctly ignored.
//
// Driven against the f17 fixture in internal/testfixtures.

import { describe, it, expect } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { ResolverClient } from "../src/resolver-client.js";
import { rewrite } from "../src/rewrite.js";

const ROOT = path.resolve(__dirname, "../../..");
const BIN = path.resolve(ROOT, "bin/ts-run-types");
const FIXTURES = path.resolve(ROOT, "internal/testfixtures");

function hasBinary() {
  return fs.existsSync(BIN);
}

async function withResolver<T>(fn: (c: ResolverClient) => Promise<T>): Promise<T> {
  if (!hasBinary()) throw new Error(`ts-run-types binary not built: ${BIN}`);
  const client = new ResolverClient(BIN, FIXTURES, "tsconfig.json");
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

describe("vite-plugin-runtypes / wrapping", () => {
  const available = hasBinary();
  const runMaybe = available ? it : it.skip;

  runMaybe("user-defined wrapper with RuntypeId<T> trailing param gets injected", async () => {
    await withResolver(async (client) => {
      const file = "f17_runtype_id.ts";
      const code = fs.readFileSync(path.join(FIXTURES, file), "utf8");
      const { code: out, sites } = await rewrite(file, code, client);

      // f17 has four directly rewritable sites (17a–17d). The two
      // negative cases (17e free-T body, 17f wrong-module) are skipped.
      expect(sites.length).toBe(4);

      for (const s of sites) {
        expect(s.id).toMatch(/^[A-Za-z][A-Za-z0-9]+$/);
      }

      // Verify each call site got the id appended right before the
      // closing `)`. We don't assert exact positions — just that the
      // emitted text contains the four ids in surrounding context that
      // matches what the call should look like.
      const ids = sites.map((s) => JSON.stringify(s.id));
      // 17c — explicit type arg, wrapper. Argument was `true`.
      expect(out).toMatch(/isType<\{ flag: boolean \}>\(true, "[A-Za-z0-9]+"\)/);
      // 17d — inferred from object. The injected id sits after the obj arg.
      expect(out).toMatch(/nameOf\(\{ kind: "node", value: 42 \}, "[A-Za-z0-9]+"\)/);
      // Every site's id is unique to its T, so all four show up in the patched output.
      for (const idLit of ids) {
        expect(out).toContain(idLit);
      }

      // Negative-case 17e: the call `getRuntypeId<T>(val)` inside the
      // generic body of `inner<T>` must NOT have an injected id, because
      // T is unbound there. The body stays as-is.
      expect(out).toContain(`return getRuntypeId<T>(val);`);

      // Negative-case 17f: `maskedWrapper("noop")` references a local
      // `RuntypeId_Local` type, not from `@mionkit/runtypes`. The call
      // must remain untouched.
      expect(out).toContain(`maskedWrapper("noop");`);
    });
  });

  runMaybe("calls with zero args still get the id at the right slot", async () => {
    await withResolver(async (client) => {
      const file = "f17_runtype_id.ts";
      const code = fs.readFileSync(path.join(FIXTURES, file), "utf8");
      const { code: out } = await rewrite(file, code, client);
      // 17b — `getRuntypeId<string>()` has zero args but the trailing slot
      // is the second parameter (paramIndex 1). The patcher pads with
      // `undefined` so the id lands at slot 1.
      expect(out).toMatch(/getRuntypeId<string>\(undefined, "[A-Za-z0-9]+"\)/);
    });
  });
});
