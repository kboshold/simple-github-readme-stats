import type { z } from "zod";
import { StatsError } from "../src/errors.ts";
import type { GraphQLClient } from "../src/fetch/client.ts";

function asStatsError(error: unknown): StatsError {
  if (error instanceof StatsError) {
    return error;
  }
  throw error;
}

function missingError(): never {
  throw new Error("expected a StatsError");
}

export function captureError(run: () => unknown): StatsError;
export function captureError(run: Promise<unknown>): Promise<StatsError>;
export function captureError(
  run: (() => unknown) | Promise<unknown>,
): StatsError | Promise<StatsError> {
  if (typeof run !== "function") {
    return run.then(missingError, asStatsError);
  }
  try {
    run();
  } catch (error) {
    return asStatsError(error);
  }
  return missingError();
}

export function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function fakeClient(respond: (call: number) => unknown) {
  const calls: { document: string; variables: Record<string, unknown> }[] = [];
  const client: GraphQLClient = {
    async query<T>(
      document: string,
      variables: Record<string, unknown>,
      schema: z.ZodType<T>,
    ) {
      calls.push({ document, variables });
      return schema.parse(respond(calls.length));
    },
  };
  return { client, calls };
}
