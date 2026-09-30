import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  isSameOriginRequest,
  resolveSnapshot,
} from "../../src/dev/vite-plugin.ts";
import { readSnapshot, type Snapshot } from "../../src/fetch/snapshot.ts";

function makeSnapshot(fetchedAt: string): Snapshot {
  return {
    schemaVersion: 1,
    fetchedAt,
    user: { login: "octocat", name: null, followers: 1 },
    totals: {
      stars: 1,
      commits: 2,
      prs: 3,
      issues: 4,
      reviews: 5,
      contributedTo: 6,
    },
    languages: [{ name: "TypeScript", color: "3178c6", bytes: 10 }],
  };
}

describe("resolveSnapshot", () => {
  let dir: string;
  let cachePath: string;
  let fixturePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "preview-"));
    cachePath = join(dir, "cache.json");
    fixturePath = join(dir, "fixture.json");
    await writeFile(
      fixturePath,
      JSON.stringify(makeSnapshot("2026-01-01T00:00:00.000Z")),
    );
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("uses the cache when it is valid", async () => {
    await writeFile(
      cachePath,
      JSON.stringify(makeSnapshot("2026-09-30T12:00:00.000Z")),
    );
    const result = await resolveSnapshot(cachePath, fixturePath, readSnapshot);
    expect(result.source).toBe("cache");
    expect(result.snapshot.fetchedAt).toBe("2026-09-30T12:00:00.000Z");
  });

  it("falls back to the fixture when the cache is missing", async () => {
    const result = await resolveSnapshot(cachePath, fixturePath, readSnapshot);
    expect(result.source).toBe("fixture");
    expect(result.snapshot.fetchedAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("falls back to the fixture when the cache is not JSON", async () => {
    await writeFile(cachePath, "{ broken");
    const result = await resolveSnapshot(cachePath, fixturePath, readSnapshot);
    expect(result.source).toBe("fixture");
  });

  it("falls back to the fixture when the cache fails the schema", async () => {
    await writeFile(cachePath, JSON.stringify({ schemaVersion: 99 }));
    const result = await resolveSnapshot(cachePath, fixturePath, readSnapshot);
    expect(result.source).toBe("fixture");
  });

  it("falls back on a coded error from another StatsError class", async () => {
    class ForeignStatsError extends Error {
      readonly code = "SNAPSHOT_MISSING";
      override name = "StatsError";
    }
    const result = await resolveSnapshot(
      cachePath,
      fixturePath,
      async (path) => {
        if (path === cachePath) {
          throw new ForeignStatsError("missing");
        }
        return readSnapshot(path);
      },
    );
    expect(result.source).toBe("fixture");
  });

  it("rethrows errors that are not coded", async () => {
    await expect(
      resolveSnapshot(cachePath, fixturePath, async () => {
        throw new Error("disk on fire");
      }),
    ).rejects.toThrow("disk on fire");
  });

  it("fails when both cache and fixture are unusable", async () => {
    await writeFile(fixturePath, "{}");
    await expect(
      resolveSnapshot(cachePath, fixturePath, readSnapshot),
    ).rejects.toThrow(/invalid/);
  });
});

describe("isSameOriginRequest", () => {
  it("allows requests without Sec-Fetch-Site", () => {
    expect(isSameOriginRequest({})).toBe(true);
  });

  it.each(["same-origin", "none"])("allows %s", (site) => {
    expect(isSameOriginRequest({ "sec-fetch-site": site })).toBe(true);
  });

  it.each(["cross-site", "same-site"])("rejects %s", (site) => {
    expect(isSameOriginRequest({ "sec-fetch-site": site })).toBe(false);
  });
});
