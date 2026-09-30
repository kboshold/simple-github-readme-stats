import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StatsError } from "../../src/errors.ts";
import {
  readSnapshot,
  type Snapshot,
  snapshotSchema,
  writeSnapshot,
} from "../../src/fetch/snapshot.ts";

const snapshot: Snapshot = {
  schemaVersion: 1,
  fetchedAt: "2026-09-30T12:00:00.000Z",
  user: { login: "octocat", name: null, followers: 22 },
  totals: {
    stars: 61,
    commits: 10240,
    prs: 754,
    issues: 290,
    reviews: 3,
    contributedTo: 51,
  },
  languages: [
    { name: "TypeScript", color: "3178c6", bytes: 450 },
    { name: "Mystery", color: null, bytes: 30 },
  ],
};

async function captureError(run: Promise<unknown>): Promise<StatsError> {
  try {
    await run;
  } catch (error) {
    if (error instanceof StatsError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a StatsError");
}

describe("snapshot", () => {
  let directory: string;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "snapshot-test-"));
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it("writes into a missing directory and reads the same value back", async () => {
    const path = join(directory, ".cache", "data.json");

    await writeSnapshot(path, snapshot);

    expect(await readSnapshot(path)).toEqual(snapshot);
    expect(await readFile(path, "utf8")).toMatch(/\n$/);
  });

  it("replaces the file without leaving temp files behind", async () => {
    const path = join(directory, "data.json");
    await writeFile(path, "old");

    await writeSnapshot(path, snapshot);

    expect(await readdir(directory)).toEqual(["data.json"]);
    expect(await readSnapshot(path)).toEqual(snapshot);
  });

  it("throws SNAPSHOT_MISSING when the file does not exist", async () => {
    const error = await captureError(
      readSnapshot(join(directory, "none.json")),
    );

    expect(error.code).toBe("SNAPSHOT_MISSING");
  });

  it("throws SNAPSHOT_INVALID for broken JSON", async () => {
    const path = join(directory, "data.json");
    await writeFile(path, "{ not json");

    expect((await captureError(readSnapshot(path))).code).toBe(
      "SNAPSHOT_INVALID",
    );
  });

  it("throws SNAPSHOT_INVALID for another schemaVersion", async () => {
    const path = join(directory, "data.json");
    await writeFile(path, JSON.stringify({ ...snapshot, schemaVersion: 2 }));

    const error = await captureError(readSnapshot(path));

    expect(error.code).toBe("SNAPSHOT_INVALID");
    expect(error.message).toContain("schemaVersion");
  });

  it("rejects negative counts and colors with a leading #", () => {
    expect(
      snapshotSchema.safeParse({
        ...snapshot,
        totals: { ...snapshot.totals, stars: -1 },
      }).success,
    ).toBe(false);
    expect(
      snapshotSchema.safeParse({
        ...snapshot,
        languages: [{ name: "TypeScript", color: "#3178c6", bytes: 1 }],
      }).success,
    ).toBe(false);
  });

  it("rejects fields outside the schema, so names cannot be added", async () => {
    expect(
      snapshotSchema.safeParse({ ...snapshot, repositories: ["a/b"] }).success,
    ).toBe(false);
    expect(
      snapshotSchema.safeParse({
        ...snapshot,
        languages: [
          { name: "Go", color: null, bytes: 1, repository: "octocat/a" },
        ],
      }).success,
    ).toBe(false);
  });
});
