import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { pushToGist } from "../../src/publish/gist.ts";
import { captureError, json } from "../helpers.ts";

const RAW_URL = "https://gist.githubusercontent.com/raw/stats-dark.svg";

interface RecordedRequest {
  url: string;
  method: string;
  body: unknown;
  authorization: string | null;
}

function gist(files: Record<string, unknown>): Response {
  return json(200, { id: "gist", files });
}

function setup(responses: Array<() => Response>) {
  const requests: RecordedRequest[] = [];
  const sleeps: number[] = [];
  const queue = [...responses];
  const fakeFetch: typeof fetch = async (input, init) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    const body =
      typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({
      url,
      method: init?.method ?? "GET",
      body,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error("no response queued");
    }
    return next();
  };
  const sleep = async (ms: number) => {
    sleeps.push(ms);
  };
  return { fakeFetch, sleep, requests, sleeps };
}

const local = [
  { name: "stats-dark.svg", content: "<svg>dark</svg>" },
  { name: "stats-light.svg", content: "<svg>light</svg>" },
];

const PatchBodySchema = z.object({
  files: z.record(z.string(), z.object({ content: z.string() })),
});

describe("pushToGist", () => {
  function run(
    ctx: ReturnType<typeof setup>,
    dryRun = false,
    files = local,
  ): Promise<string[]> {
    return pushToGist({
      gistId: "abc123",
      token: "secret-token",
      files,
      dryRun,
      fetch: ctx.fakeFetch,
      sleep: ctx.sleep,
    });
  }

  it("sends no PATCH when nothing changed", async () => {
    const ctx = setup([
      () =>
        gist({
          "stats-dark.svg": { content: "<svg>dark</svg>" },
          "stats-light.svg": { content: "<svg>light</svg>" },
        }),
    ]);

    expect(await run(ctx)).toEqual([]);
    expect(ctx.requests).toHaveLength(1);
    expect(ctx.requests[0]?.method).toBe("GET");
    expect(ctx.requests[0]?.url).toBe("https://api.github.com/gists/abc123");
    expect(ctx.requests[0]?.authorization).toBe("token secret-token");
  });

  it("patches only the changed file and leaves other Gist files alone", async () => {
    const ctx = setup([
      () =>
        gist({
          "stats-dark.svg": { content: "<svg>old</svg>" },
          "stats-light.svg": { content: "<svg>light</svg>" },
          "notes.md": { content: "keep me" },
        }),
      () => json(200, { id: "abc123", files: {} }),
    ]);

    expect(await run(ctx)).toEqual(["stats-dark.svg"]);
    expect(ctx.requests).toHaveLength(2);
    const patch = ctx.requests[1];
    expect(patch?.method).toBe("PATCH");
    expect(patch?.url).toBe("https://api.github.com/gists/abc123");
    expect(PatchBodySchema.parse(patch?.body)).toEqual({
      files: { "stats-dark.svg": { content: "<svg>dark</svg>" } },
    });
  });

  it("adds a file missing from the Gist", async () => {
    const ctx = setup([
      () => gist({ "stats-light.svg": { content: "<svg>light</svg>" } }),
      () => json(200, { id: "abc123", files: {} }),
    ]);

    expect(await run(ctx)).toEqual(["stats-dark.svg"]);
    expect(PatchBodySchema.parse(ctx.requests[1]?.body).files).toEqual({
      "stats-dark.svg": { content: "<svg>dark</svg>" },
    });
  });

  it("fetches the raw content of a truncated file before comparing", async () => {
    const ctx = setup([
      () =>
        gist({
          "stats-dark.svg": {
            content: "<svg>da",
            truncated: true,
            raw_url: RAW_URL,
          },
          "stats-light.svg": { content: "<svg>light</svg>" },
        }),
      () => new Response("<svg>dark</svg>", { status: 200 }),
    ]);

    expect(await run(ctx)).toEqual([]);
    expect(ctx.requests).toHaveLength(2);
    expect(ctx.requests[1]?.url).toBe(RAW_URL);
  });

  it("retries a network error on the raw file fetch", async () => {
    const ctx = setup([
      () =>
        gist({
          "stats-dark.svg": { truncated: true, raw_url: RAW_URL },
          "stats-light.svg": { content: "<svg>light</svg>" },
        }),
      () => {
        throw new TypeError("fetch failed");
      },
      () => new Response("<svg>dark</svg>", { status: 200 }),
    ]);

    expect(await run(ctx)).toEqual([]);
    expect(ctx.sleeps).toEqual([1000]);
    expect(ctx.requests.map((request) => request.url)).toEqual([
      "https://api.github.com/gists/abc123",
      RAW_URL,
      RAW_URL,
    ]);
  });

  it("treats a file named like an object key as new", async () => {
    const ctx = setup([() => gist({})]);

    expect(
      await run(ctx, true, [{ name: "constructor", content: "x" }]),
    ).toEqual(["constructor"]);
  });

  it("does not send a PATCH on a dry run", async () => {
    const ctx = setup([
      () => gist({ "stats-dark.svg": { content: "<svg>old</svg>" } }),
    ]);

    expect(await run(ctx, true)).toEqual(["stats-dark.svg", "stats-light.svg"]);
    expect(ctx.requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it.each([
    ["404", () => json(404, { message: "Not Found" }), "GIST_NOT_FOUND"],
    ["403", () => json(403, { message: "Forbidden" }), "GIST_FORBIDDEN"],
    ["401", () => json(401, { message: "Bad" }), "API_ERROR"],
    [
      "a rate limit",
      () =>
        json(403, { message: "rate limit" }, { "x-ratelimit-remaining": "0" }),
      "API_ERROR",
    ],
  ])("maps %s to %s without retrying", async (_, response, code) => {
    const ctx = setup([response]);

    await expect(run(ctx)).rejects.toMatchObject({ code });
    expect(ctx.sleeps).toEqual([]);
  });

  it("maps a 403 on PATCH to GIST_FORBIDDEN", async () => {
    const ctx = setup([
      () => gist({}),
      () => json(403, { message: "Forbidden" }),
    ]);

    await expect(run(ctx)).rejects.toMatchObject({ code: "GIST_FORBIDDEN" });
  });

  it("retries a 502 and then succeeds", async () => {
    const ctx = setup([
      () => json(502, { message: "Bad Gateway" }),
      () =>
        gist({
          "stats-dark.svg": { content: "<svg>dark</svg>" },
          "stats-light.svg": { content: "<svg>light</svg>" },
        }),
    ]);

    expect(await run(ctx)).toEqual([]);
    expect(ctx.sleeps).toEqual([1000]);
  });

  it("reports API_ERROR after retries are exhausted", async () => {
    const ctx = setup(
      Array.from({ length: 4 }, () => () => json(503, { message: "down" })),
    );

    await expect(run(ctx)).rejects.toMatchObject({ code: "API_ERROR" });
    expect(ctx.sleeps).toEqual([1000, 3000, 9000]);
  });

  it("rejects an invalid Gist response", async () => {
    const ctx = setup([() => json(200, { files: "nope" })]);

    await expect(run(ctx)).rejects.toMatchObject({ code: "RESPONSE_INVALID" });
  });

  it("never includes the token in error messages", async () => {
    const ctx = setup([() => json(500, { message: "boom" })]);

    const error = await captureError(run(ctx));
    expect(inspect(error, { depth: null, showHidden: true })).not.toContain(
      "secret-token",
    );
  });
});
