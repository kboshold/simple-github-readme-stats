import type { z } from "zod";

export type StatsErrorCode =
  | "CONFIG_INVALID"
  | "TOKEN_MISSING"
  | "TOKEN_UNAUTHORIZED"
  | "USER_NOT_FOUND"
  | "RATE_LIMITED"
  | "API_ERROR"
  | "RESPONSE_INVALID"
  | "SNAPSHOT_MISSING"
  | "SNAPSHOT_INVALID"
  | "DIST_EMPTY"
  | "GIST_NOT_FOUND"
  | "GIST_FORBIDDEN";

export class StatsError extends Error {
  readonly code: StatsErrorCode;

  constructor(code: StatsErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StatsError";
    this.code = code;
  }
}

export function issuePaths(error: z.ZodError): string {
  const paths = error.issues.map(
    (issue) => issue.path.map(String).join(".") || "(root)",
  );
  return [...new Set(paths)].join(", ");
}

function formatError(error: unknown): string {
  if (error instanceof StatsError) {
    return `error[${error.code}]: ${error.message}`;
  }
  const message = error instanceof Error ? error.message : String(error);
  return `error[INTERNAL]: ${message}`;
}

export async function runCli(main: () => Promise<void>): Promise<void> {
  try {
    await main();
  } catch (error) {
    process.stderr.write(
      `${formatError(error).replaceAll(/\s*\n\s*/g, " ")}\n`,
    );
    if (!(error instanceof StatsError) && error instanceof Error) {
      process.stderr.write(`${error.stack ?? ""}\n`);
    }
    process.exit(1);
  }
}
