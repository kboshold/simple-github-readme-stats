import { existsSync } from "node:fs";
import { StatsError } from "../errors.ts";

export function loadEnvFile(path = ".env"): void {
  if (existsSync(path)) {
    process.loadEnvFile(path);
  }
}

export function requireToken(
  env: Record<string, string | undefined> = process.env,
): string {
  const token = env.GH_TOKEN?.trim() ?? "";
  if (token === "") {
    throw new StatsError("TOKEN_MISSING", "GH_TOKEN is not set");
  }
  return token;
}
