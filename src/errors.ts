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
  | "GIST_FORBIDDEN"
  | "CARD_NOT_FOUND"
  | "RENDER_FAILED"
  | "FETCH_FAILED";

export class StatsError extends Error {
  readonly code: StatsErrorCode;

  constructor(code: StatsErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "StatsError";
    this.code = code;
  }
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
    process.exit(1);
  }
}
