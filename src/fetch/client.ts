import { setTimeout as delay } from "node:timers/promises";
import { GraphqlResponseError, graphql } from "@octokit/graphql";
import { z } from "zod";
import { StatsError } from "../errors.ts";

export interface GraphQLClient {
  query<T>(
    document: string,
    variables: Record<string, unknown>,
    schema: z.ZodType<T>,
  ): Promise<T>;
}

export interface ClientOptions {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

type Failure =
  | { retry: false; error: StatsError }
  | { retry: true; error: StatsError; retryAfterMs: number };

const BACKOFF_MS = [1000, 3000, 9000];
const MAX_RETRY_AFTER_MS = 60_000;

const GraphqlErrorsSchema = z.array(
  z.object({
    type: z.string().optional(),
    message: z.string().optional(),
    path: z.array(z.unknown()).optional(),
  }),
);

const HttpErrorSchema = z.object({
  status: z.number(),
  message: z.string(),
  response: z.object({ headers: z.record(z.string(), z.unknown()) }).optional(),
});

function fatal(error: StatsError): Failure {
  return { retry: false, error };
}

function retryable(error: StatsError, retryAfterMs = 0): Failure {
  return { retry: true, error, retryAfterMs };
}

function classifyGraphqlError(error: GraphqlResponseError<unknown>): Failure {
  const parsed = GraphqlErrorsSchema.safeParse(error.errors);
  const errors = parsed.success ? parsed.data : [];

  if (errors.some((entry) => entry.type === "INSUFFICIENT_SCOPES")) {
    return fatal(
      new StatsError(
        "TOKEN_UNAUTHORIZED",
        "GH_TOKEN lacks a required scope (read:user, repo, read:org)",
      ),
    );
  }
  if (
    errors.some(
      (entry) => entry.type === "NOT_FOUND" && entry.path?.[0] === "user",
    )
  ) {
    return fatal(new StatsError("USER_NOT_FOUND", "GitHub user not found"));
  }
  if (errors.some((entry) => entry.type === "RATE_LIMITED")) {
    return fatal(
      new StatsError("RATE_LIMITED", "GitHub GraphQL rate limit exceeded"),
    );
  }

  // Messages of errors bound to a data path can name repositories, so only the type is reported.
  const details = errors.map(
    (entry) =>
      entry.type ??
      (entry.path === undefined ? entry.message : undefined) ??
      "unknown",
  );
  const hint = details.includes("FORBIDDEN")
    ? " (the token may lack SSO authorization for an organization)"
    : "";
  return fatal(
    new StatsError(
      "API_ERROR",
      `GraphQL request failed: ${[...new Set(details)].join(", ")}${hint}`,
    ),
  );
}

function classifyHttpError(error: z.infer<typeof HttpErrorSchema>): Failure {
  const { status, message, response } = error;

  if (response === undefined) {
    return retryable(new StatsError("API_ERROR", `Network error: ${message}`));
  }
  if (status === 401) {
    return fatal(
      new StatsError("TOKEN_UNAUTHORIZED", "GitHub rejected GH_TOKEN (401)"),
    );
  }
  if (status === 403 || status === 429) {
    const header = response.headers["retry-after"];
    const retryAfter =
      typeof header === "string" && header.trim() !== ""
        ? Number(header)
        : Number.NaN;
    const hasRetryAfter = Number.isFinite(retryAfter) && retryAfter >= 0;
    const limited = new StatsError(
      "RATE_LIMITED",
      `GitHub rate limit exceeded (${status})`,
    );
    if (hasRetryAfter && retryAfter * 1000 > MAX_RETRY_AFTER_MS) {
      return fatal(limited);
    }
    if (hasRetryAfter || status === 429 || /secondary rate/i.test(message)) {
      return retryable(limited, hasRetryAfter ? retryAfter * 1000 : 0);
    }
    if (String(response.headers["x-ratelimit-remaining"]) === "0") {
      return fatal(limited);
    }
  }

  const failure = new StatsError(
    "API_ERROR",
    `GitHub API request failed (${status})`,
  );
  return status === 502 || status === 503 ? retryable(failure) : fatal(failure);
}

function classify(error: unknown): Failure {
  if (error instanceof GraphqlResponseError) {
    return classifyGraphqlError(error);
  }
  const http = HttpErrorSchema.safeParse(error);
  if (http.success) {
    return classifyHttpError(http.data);
  }
  const message = error instanceof Error ? error.message : String(error);
  return fatal(new StatsError("API_ERROR", message, { cause: error }));
}

export function createClient(
  token: string,
  options: ClientOptions = {},
): GraphQLClient {
  const sleep = options.sleep ?? ((ms: number) => delay(ms));
  const request = graphql.defaults({
    headers: { authorization: `token ${token}` },
    request: { fetch: options.fetch ?? fetch },
  });

  async function execute(
    document: string,
    variables: Record<string, unknown>,
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await request(document, variables);
      } catch (error) {
        const failure = classify(error);
        const backoff = BACKOFF_MS[attempt];
        if (!failure.retry || backoff === undefined) {
          throw failure.error;
        }
        await sleep(Math.max(backoff, failure.retryAfterMs));
      }
    }
  }

  return {
    async query<T>(
      document: string,
      variables: Record<string, unknown>,
      schema: z.ZodType<T>,
    ): Promise<T> {
      const parsed = schema.safeParse(await execute(document, variables));
      if (!parsed.success) {
        const paths = parsed.error.issues.map(
          (issue) => issue.path.map(String).join(".") || "(root)",
        );
        throw new StatsError(
          "RESPONSE_INVALID",
          `Unexpected GitHub response shape at: ${[...new Set(paths)].join(", ")}`,
        );
      }
      return parsed.data;
    },
  };
}
