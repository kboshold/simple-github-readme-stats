import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StatsError } from "../../src/errors.ts";
import { createClient } from "../../src/fetch/client.ts";

const schema = z.object({ viewer: z.object({ login: z.string() }) });
const success = () => json(200, { data: { viewer: { login: "octocat" } } });

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function setup(responses: Array<() => Response>) {
  const sleeps: number[] = [];
  const requests: RequestInit[] = [];
  const queue = [...responses];
  const fakeFetch: typeof fetch = async (_input, init) => {
    requests.push(init ?? {});
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("no response queued");
    }
    return next();
  };
  const client = createClient("secret-token", {
    fetch: fakeFetch,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  });
  return { client, sleeps, requests };
}

async function captureError(run: Promise<unknown>): Promise<StatsError> {
  try {
    await run;
  } catch (error) {
    if (error instanceof StatsError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected a StatsError");
}

describe("createClient", () => {
  it("sends the token, document and variables and returns parsed data", async () => {
    const { client, requests, sleeps } = setup([success]);

    const data = await client.query(
      "query { viewer { login } }",
      { a: 1 },
      schema,
    );

    expect(data).toEqual({ viewer: { login: "octocat" } });
    expect(sleeps).toEqual([]);
    expect(new Headers(requests[0]?.headers).get("authorization")).toBe(
      "token secret-token",
    );
    expect(JSON.parse(String(requests[0]?.body))).toEqual({
      query: "query { viewer { login } }",
      variables: { a: 1 },
    });
  });

  it("retries on 502 and then succeeds", async () => {
    const { client, sleeps } = setup([
      () => json(502, { message: "Bad Gateway" }),
      () => json(503, { message: "Unavailable" }),
      success,
    ]);

    await expect(client.query("query", {}, schema)).resolves.toEqual({
      viewer: { login: "octocat" },
    });
    expect(sleeps).toEqual([1000, 3000]);
  });

  it("retries network errors", async () => {
    const { client, sleeps } = setup([
      () => {
        throw new TypeError("fetch failed");
      },
      success,
    ]);

    await client.query("query", {}, schema);

    expect(sleeps).toEqual([1000]);
  });

  it("gives up with API_ERROR after the last backoff", async () => {
    const bad = () => json(502, { message: "Bad Gateway" });
    const { client, sleeps } = setup([bad, bad, bad, bad]);

    const error = await captureError(client.query("query", {}, schema));

    expect(error.code).toBe("API_ERROR");
    expect(sleeps).toEqual([1000, 3000, 9000]);
  });

  it("maps 401 to TOKEN_UNAUTHORIZED without retrying", async () => {
    const { client, sleeps } = setup([
      () => json(401, { message: "Bad credentials" }),
    ]);

    const error = await captureError(client.query("query", {}, schema));

    expect(error.code).toBe("TOKEN_UNAUTHORIZED");
    expect(error.message).not.toContain("secret-token");
    expect(sleeps).toEqual([]);
  });

  it("maps missing scopes to TOKEN_UNAUTHORIZED", async () => {
    const { client } = setup([
      () =>
        json(200, {
          data: null,
          errors: [{ type: "INSUFFICIENT_SCOPES", message: "needs read:org" }],
        }),
    ]);

    const error = await captureError(client.query("query", {}, schema));

    expect(error.code).toBe("TOKEN_UNAUTHORIZED");
  });

  it("maps NOT_FOUND on user to USER_NOT_FOUND", async () => {
    const { client } = setup([
      () =>
        json(200, {
          data: { user: null },
          errors: [{ type: "NOT_FOUND", path: ["user"], message: "no user" }],
        }),
    ]);

    const error = await captureError(client.query("query", {}, schema));

    expect(error.code).toBe("USER_NOT_FOUND");
  });

  it("maps the primary rate limit to RATE_LIMITED without retrying", async () => {
    const graphqlLimit = setup([
      () => json(200, { errors: [{ type: "RATE_LIMITED", message: "limit" }] }),
    ]);
    const httpLimit = setup([
      () =>
        json(
          403,
          { message: "API rate limit exceeded" },
          { "x-ratelimit-remaining": "0" },
        ),
    ]);

    for (const { client, sleeps } of [graphqlLimit, httpLimit]) {
      const error = await captureError(client.query("query", {}, schema));
      expect(error.code).toBe("RATE_LIMITED");
      expect(sleeps).toEqual([]);
    }
  });

  it("honors retry-after on secondary rate limits", async () => {
    const { client, sleeps } = setup([
      () =>
        json(
          403,
          { message: "You have exceeded a secondary rate limit" },
          { "retry-after": "5" },
        ),
      success,
    ]);

    await client.query("query", {}, schema);

    expect(sleeps).toEqual([5000]);
  });

  it("maps a persistent secondary rate limit to RATE_LIMITED", async () => {
    const limited = () =>
      json(403, { message: "You have exceeded a secondary rate limit" });
    const { client, sleeps } = setup([limited, limited, limited, limited]);

    const error = await captureError(client.query("query", {}, schema));

    expect(error.code).toBe("RATE_LIMITED");
    expect(sleeps).toEqual([1000, 3000, 9000]);
  });

  it("does not wait for a retry-after above one minute", async () => {
    const { client, sleeps } = setup([
      () => json(429, { message: "slow down" }, { "retry-after": "3600" }),
    ]);

    const error = await captureError(client.query("query", {}, schema));

    expect(error.code).toBe("RATE_LIMITED");
    expect(sleeps).toEqual([]);
  });

  it("does not retry a plain 403 with an empty retry-after header", async () => {
    const { client, sleeps } = setup([
      () => json(403, { message: "Forbidden" }, { "retry-after": "" }),
    ]);

    const error = await captureError(client.query("query", {}, schema));

    expect(error.code).toBe("API_ERROR");
    expect(sleeps).toEqual([]);
  });

  it("maps a malformed body to RESPONSE_INVALID", async () => {
    const wrongShape = setup([() => json(200, { data: { viewer: {} } })]);
    const notJson = setup([
      () => new Response("<html>oops</html>", { status: 200 }),
    ]);

    for (const { client } of [wrongShape, notJson]) {
      const error = await captureError(client.query("query", {}, schema));
      expect(error.code).toBe("RESPONSE_INVALID");
    }
  });

  it("reports only the type of path-bound GraphQL errors", async () => {
    const { client } = setup([
      () =>
        json(200, {
          data: null,
          errors: [
            {
              type: "FORBIDDEN",
              path: ["user", "repositories", "nodes", 3],
              message: "acme/secret-repo is protected",
            },
          ],
        }),
    ]);

    const error = await captureError(client.query("query", {}, schema));

    expect(error.code).toBe("API_ERROR");
    expect(error.message).toContain("FORBIDDEN");
    expect(error.message).toContain("SSO authorization");
    expect(error.message).not.toContain("secret-repo");
  });
});
