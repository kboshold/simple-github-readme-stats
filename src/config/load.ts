import { z } from "zod";
import { StatsError } from "../errors.ts";
import {
  type Config,
  ConfigSchema,
  LoginSchema,
  RepoNameSchema,
} from "./schema.ts";

type Env = Record<string, string | undefined>;

const EnvListsSchema = z.object({
  STATS_ORGS: z.array(LoginSchema),
  STATS_EXCLUDE_REPOS: z.array(RepoNameSchema),
});

function splitList(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry) => entry !== "");
}

function mergeUnique(base: string[], extra: string[]): string[] {
  const seen = new Set<string>();
  return [...base, ...extra].filter((entry) => {
    const key = entry.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.map(String).join(".");
    return path === "" ? issue.message : `${path}: ${issue.message}`;
  });
}

export function resolveConfig(input: unknown, env: Env = process.env): Config {
  const config = ConfigSchema.safeParse(input);
  const lists = EnvListsSchema.safeParse({
    STATS_ORGS: splitList(env.STATS_ORGS),
    STATS_EXCLUDE_REPOS: splitList(env.STATS_EXCLUDE_REPOS),
  });

  if (!config.success || !lists.success) {
    const problems = [
      ...(config.success ? [] : describeIssues(config.error)),
      ...(lists.success ? [] : describeIssues(lists.error)),
    ];
    throw new StatsError("CONFIG_INVALID", problems.join("; "));
  }

  return {
    ...config.data,
    orgs: mergeUnique(config.data.orgs, lists.data.STATS_ORGS),
    excludeRepos: mergeUnique(
      config.data.excludeRepos,
      lists.data.STATS_EXCLUDE_REPOS,
    ),
  };
}

export async function loadConfig(env: Env = process.env): Promise<Config> {
  const module = await import("../../stats.config.ts");
  return resolveConfig(module.default, env);
}
