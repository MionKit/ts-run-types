import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import type { Request, Response } from "./protocol.js";

// ResolverClient spawns the ts-run-types binary in one-shot mode and drives it
// over its JSON-per-line stdio protocol. One binary invocation per build — the
// child process is kept alive until `close()` so Program + checker cache are
// amortised across all queries.
export class ResolverClient {
  private child: ChildProcess;
  private stdin: Writable;
  private stdout: Readable;
  private lines: Interface;
  private queue: Array<(r: Response) => void> = [];
  private closed = false;

  constructor(
    private readonly binary: string,
    private readonly cwd: string,
    tsconfigPath: string,
  ) {
    this.child = spawn(binary, ["--one-shot", "--tsconfig", tsconfigPath, "--cwd", cwd], {
      stdio: ["pipe", "pipe", "inherit"],
    });
    if (!this.child.stdin || !this.child.stdout) {
      throw new Error("failed to spawn ts-run-types (no stdio pipes)");
    }
    this.stdin = this.child.stdin;
    this.stdout = this.child.stdout;
    this.lines = createInterface({ input: this.stdout });
    this.lines.on("line", (line) => {
      const done = this.queue.shift();
      if (!done) return;
      try {
        done(JSON.parse(line));
      } catch (e) {
        done({ error: `parse: ${String(e)}` });
      }
    });
    this.child.on("exit", () => {
      this.closed = true;
      while (this.queue.length) this.queue.shift()!({ error: "resolver exited" });
    });
  }

  async request(req: Request): Promise<Response> {
    if (this.closed) throw new Error("resolver is closed");
    return new Promise<Response>((resolve) => {
      this.queue.push(resolve);
      this.stdin.write(JSON.stringify(req) + "\n");
    });
  }

  async dump(): Promise<Response> {
    return this.request({ op: "dump" });
  }

  close(): void {
    if (this.closed) return;
    this.stdin.end();
    this.child.kill();
    this.closed = true;
  }
}
