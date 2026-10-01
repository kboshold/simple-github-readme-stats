import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    await expect(
      readSnapshot(join(directory, "none.json")),
    ).rejects.toMatchObject({ code: "SNAPSHOT_MISSING" });
  });

  it.each([
    ["broken JSON", "{ not json", ""],
    [
      "another schemaVersion",
      JSON.stringify({ ...snapshot, schemaVersion: 2 }),
      "schemaVersion",
    ],
  ])("throws SNAPSHOT_INVALID for %s", async (_, content, message) => {
    const path = join(directory, "data.json");
    await writeFile(path, content);

    await expect(readSnapshot(path)).rejects.toMatchObject({
      code: "SNAPSHOT_INVALID",
      message: expect.stringContaining(message),
    });
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
