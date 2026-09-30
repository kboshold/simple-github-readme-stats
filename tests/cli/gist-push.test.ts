import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

const run = promisify(execFile);
const ROOT = resolve(import.meta.dirname, "../..");
const TSX = join(ROOT, "node_modules/.bin/tsx");
const SCRIPT = join(ROOT, "src/cli/gist-push.ts");

const ExecErrorSchema = z.object({ code: z.number(), stderr: z.string() });

describe("gist:push CLI", () => {
  let cwd: string;

  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), "gist-push-"));
  });

  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  it("reports DIST_EMPTY before TOKEN_MISSING", async () => {
    const error = await run(TSX, [SCRIPT, "--dry-run"], {
      cwd,
      env: { PATH: process.env.PATH, HOME: process.env.HOME },
    }).then(
      () => {
        throw new Error("expected a non-zero exit");
      },
      (reason: unknown) => ExecErrorSchema.parse(reason),
    );

    expect(error.code).toBe(1);
    expect(error.stderr).toBe(
      "error[DIST_EMPTY]: No SVG files in dist/; run pnpm svg:render first\n",
    );
  }, 30_000);
});
