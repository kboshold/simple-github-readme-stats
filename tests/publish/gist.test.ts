import { describe, expect, it } from "vitest";
import { z } from "zod";
import { StatsError } from "../../src/errors.ts";
import { diffFiles, pushToGist } from "../../src/publish/gist.ts";

const RAW_URL = "https://gist.githubusercontent.com/raw/stats-dark.svg";

interface RecordedRequest {
  url: string;
  method: string;
  body: unknown;
  authorization: string | null;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
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

const PatchBodySchema = z.object({
  files: z.record(z.string(), z.object({ content: z.string() })),
});

describe("diffFiles", () => {
  it("returns changed and new files, sorted", () => {
    const remote = new Map([
      ["stats-light.svg", "<svg>light</svg>"],
      ["stats-dark.svg", "<svg>old</svg>"],
      ["other.txt", "keep"],
    ]);
    const files = [
      ...local,
      { name: "top-langs-dark.svg", content: "<svg>langs</svg>" },
    ];

    expect(diffFiles(files, remote)).toEqual([
      "stats-dark.svg",
      "top-langs-dark.svg",
    ]);
  });

  it("returns nothing when all contents match", () => {
    const remote = new Map(local.map((file) => [file.name, file.content]));
    expect(diffFiles(local, remote)).toEqual([]);
  });

  it("ignores inherited object keys", () => {
    expect(
      diffFiles([{ name: "constructor", content: "x" }], new Map()),
    ).toEqual(["constructor"]);
  });
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

  it("does not send a PATCH on a dry run", async () => {
    const ctx = setup([
      () => gist({ "stats-dark.svg": { content: "<svg>old</svg>" } }),
    ]);

    expect(await run(ctx, true)).toEqual(["stats-dark.svg", "stats-light.svg"]);
    expect(ctx.requests.map((request) => request.method)).toEqual(["GET"]);
  });

  it("maps 404 to GIST_NOT_FOUND", async () => {
    const ctx = setup([() => json(404, { message: "Not Found" })]);

    const error = await captureError(run(ctx));
    expect(error.code).toBe("GIST_NOT_FOUND");
    expect(ctx.sleeps).toEqual([]);
  });

  it("maps 403 to GIST_FORBIDDEN", async () => {
    const ctx = setup([() => json(403, { message: "Forbidden" })]);

    const error = await captureError(run(ctx));
    expect(error.code).toBe("GIST_FORBIDDEN");
    expect(ctx.sleeps).toEqual([]);
  });

  it("maps a 403 on PATCH to GIST_FORBIDDEN", async () => {
    const ctx = setup([
      () => gist({}),
      () => json(403, { message: "Forbidden" }),
    ]);

    const error = await captureError(run(ctx));
    expect(error.code).toBe("GIST_FORBIDDEN");
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

    const error = await captureError(run(ctx));
    expect(error.code).toBe("API_ERROR");
    expect(ctx.sleeps).toEqual([1000, 3000, 9000]);
  });

  it("reports API_ERROR for 401 and rate limits", async () => {
    const unauthorized = setup([() => json(401, { message: "Bad" })]);
    expect((await captureError(run(unauthorized))).code).toBe("API_ERROR");

    const limited = setup([
      () =>
        new Response(JSON.stringify({ message: "rate limit" }), {
          status: 403,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-remaining": "0",
          },
        }),
    ]);
    expect((await captureError(run(limited))).code).toBe("API_ERROR");
  });

  it("rejects an invalid Gist response", async () => {
    const ctx = setup([() => json(200, { files: "nope" })]);

    const error = await captureError(run(ctx));
    expect(error.code).toBe("API_ERROR");
  });

  it("never includes the token in error messages", async () => {
    const ctx = setup([() => json(500, { message: "boom" })]);

    const error = await captureError(run(ctx));
    expect(error.message).not.toContain("secret-token");
  });
});
