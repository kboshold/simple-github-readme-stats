import { describe, expect, it } from "vitest";
import { calculateRank } from "../../src/render/rank.ts";

describe("calculateRank", () => {
  it("matches the live card vector", () => {
    const result = calculateRank({
      commits: 4528,
      prs: 754,
      issues: 290,
      reviews: 3,
      stars: 61,
      followers: 22,
      allCommits: false,
    });
    expect(result.percentile.toFixed(2)).toBe("20.57");
    expect(result.level).toBe("A");
  });

  it("gives C for all-zero input", () => {
    const result = calculateRank({
      commits: 0,
      prs: 0,
      issues: 0,
      reviews: 0,
      stars: 0,
      followers: 0,
      allCommits: true,
    });
    expect(result.percentile).toBe(100);
    expect(result.level).toBe("C");
  });

  it("gives S for very high input", () => {
    const result = calculateRank({
      commits: 100_000,
      prs: 10_000,
      issues: 10_000,
      reviews: 10_000,
      stars: 1_000_000,
      followers: 100_000,
      allCommits: true,
    });
    expect(result.percentile).toBeLessThanOrEqual(1);
    expect(result.level).toBe("S");
  });

  it("uses a higher commits median for all-time commits", () => {
    const base = { prs: 0, issues: 0, reviews: 0, stars: 0, followers: 0 };
    const year = calculateRank({ ...base, commits: 500, allCommits: false });
    const all = calculateRank({ ...base, commits: 500, allCommits: true });
    expect(year.percentile).toBeLessThan(all.percentile);
  });
});
