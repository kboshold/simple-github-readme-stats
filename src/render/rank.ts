const THRESHOLDS = [
  [1, "S"],
  [12.5, "A+"],
  [25, "A"],
  [37.5, "A-"],
  [50, "B+"],
  [62.5, "B"],
  [75, "B-"],
  [87.5, "C+"],
  [100, "C"],
] as const;

export type RankLevel = (typeof THRESHOLDS)[number][1];

export interface RankInput {
  commits: number;
  prs: number;
  issues: number;
  reviews: number;
  stars: number;
  followers: number;
  allCommits: boolean;
}

export interface RankResult {
  level: RankLevel;
  percentile: number;
}

function exponentialCdf(x: number): number {
  return 1 - 2 ** -x;
}

function logNormalCdf(x: number): number {
  return x / (1 + x);
}

export function calculateRank(input: RankInput): RankResult {
  const commitsMedian = input.allCommits ? 1000 : 250;
  const weighted =
    2 * exponentialCdf(input.commits / commitsMedian) +
    3 * exponentialCdf(input.prs / 50) +
    1 * exponentialCdf(input.issues / 25) +
    1 * exponentialCdf(input.reviews / 2) +
    4 * logNormalCdf(input.stars / 50) +
    1 * logNormalCdf(input.followers / 10);
  const percentile = (1 - weighted / 12) * 100;
  const level =
    THRESHOLDS.find(([threshold]) => percentile <= threshold)?.[1] ?? "C";
  return { level, percentile };
}
