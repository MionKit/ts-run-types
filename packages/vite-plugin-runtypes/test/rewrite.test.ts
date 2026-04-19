import { describe, it, expect, afterAll } from "vitest";
import path from "node:path";
import fs from "node:fs";
import { ResolverClient } from "../src/resolver-client.js";
import { rewrite, DEFAULT_MARKERS } from "../src/rewrite.js";

const ROOT = path.resolve(__dirname, "../../..");
const BIN = path.resolve(ROOT, "bin/ts-run-types");
const FIXTURES = path.resolve(ROOT, "internal/testfixtures");

function hasBinary() {
  return fs.existsSync(BIN);
}

async function withResolver<T>(fn: (c: ResolverClient) => Promise<T>): Promise<T> {
  if (!hasBinary()) {
    throw new Error(`ts-run-types binary not built: ${BIN}`);
  }
  const client = new ResolverClient(BIN, FIXTURES, "tsconfig.json");
  try {
    return await fn(client);
  } finally {
    client.close();
  }
}

describe("vite-plugin-runtypes / rewrite", () => {
  const available = hasBinary();
  const runMaybe = available ? it : it.skip;

  runMaybe("F9: rewrites isType<User>(u) to pass a site id", async () => {
    await withResolver(async (client) => {
      const file = "f2_annotation_object.ts";
      const code = fs.readFileSync(path.join(FIXTURES, file), "utf8");
      const { code: out, sites } = await rewrite(file, code, DEFAULT_MARKERS, client);

      expect(sites.length).toBe(1);
      expect(sites[0].marker).toBe("isType");
      // The emitted call carries the assigned type id.
      expect(out).toMatch(new RegExp(`isType<User>\\(u, "${sites[0].id}"\\);`));
    });
  });

  runMaybe("F10: cache dump contains User alias + its properties", async () => {
    await withResolver(async (client) => {
      const file = "f2_annotation_object.ts";
      const code = fs.readFileSync(path.join(FIXTURES, file), "utf8");
      await rewrite(file, code, DEFAULT_MARKERS, client);

      const dump = await client.dump();
      const types = dump.types ?? [];
      const user = types.find((t) => t.alias === "User");
      expect(user).toBeDefined();
      expect(user!.kind).toBe("object");
      expect(user!.properties).toBeDefined();
      expect(Object.keys(user!.properties!).sort()).toEqual(["id", "name"]);

      // Follow the property type ids to their primitives.
      const idType = types.find((t) => t.id === user!.properties!.id.type);
      const nameType = types.find((t) => t.id === user!.properties!.name.type);
      expect(idType?.name).toBe("number");
      expect(nameType?.name).toBe("string");
    });
  });

  runMaybe("F6 via plugin: router(routes) call site produces object+function projection", async () => {
    await withResolver(async (client) => {
      const file = "f6_router_inference.ts";
      const code = fs.readFileSync(path.join(FIXTURES, file), "utf8");
      const { sites } = await rewrite(file, code, DEFAULT_MARKERS, client);

      expect(sites.some((s) => s.marker === "router")).toBe(true);

      const dump = await client.dump();
      const types = dump.types ?? [];
      const root = types.find((t) => t.kind === "object" && t.properties && "sayHello" in t.properties);
      expect(root).toBeDefined();

      const sayHelloTypeId = root!.properties!.sayHello.type;
      const fn = types.find((t) => t.id === sayHelloTypeId);
      expect(fn?.kind).toBe("function");
      expect(fn?.parameters?.[0]?.name).toBe("name");
    });
  });

  // Dedup across two markers in the same file — asserts site ids for
  // identical types point at the same entry.
  runMaybe("dedup: two calls whose arguments have the same type share an id", async () => {
    await withResolver(async (client) => {
      // f1 resolves string, f4 resolves number-literal/number. They should produce
      // different ids, but running f1 twice should NOT add new entries.
      const f1 = "f1_annotation_primitive.ts";
      const code = fs.readFileSync(path.join(FIXTURES, f1), "utf8");
      const a = await rewrite(f1, code, DEFAULT_MARKERS, client);
      const dumpBefore = await client.dump();
      const b = await rewrite(f1, code, DEFAULT_MARKERS, client);
      const dumpAfter = await client.dump();

      expect(a.sites[0].id).toBe(b.sites[0].id);
      expect(dumpAfter.types?.length).toBe(dumpBefore.types?.length);
    });
  });

  afterAll(() => {
    // the resolver is closed per-test via withResolver; nothing to tear down here
  });
});
