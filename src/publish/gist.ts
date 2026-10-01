import { request as octokitRequest } from "@octokit/request";
import { z } from "zod";
import { StatsError } from "../errors.ts";
import {
  classifyHttpError,
  type Failure,
  fatal,
  HttpErrorSchema,
  isTransientStatus,
  networkError,
  retryable,
  unknownFailure,
  withRetry,
} from "../fetch/client.ts";
import type { OutputFile } from "../render/index.ts";

export interface PushOptions {
  gistId: string;
  token: string;
  files: readonly OutputFile[];
  dryRun: boolean;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const GistSchema = z.object({
  files: z.record(
    z.string(),
    z.object({
      content: z.string().nullish(),
      truncated: z.boolean().optional(),
      raw_url: z.string().nullish(),
    }),
  ),
});

type GistFile = z.infer<typeof GistSchema>["files"][string];

function diffFiles(
  local: readonly OutputFile[],
  remote: ReadonlyMap<string, string>,
): string[] {
  return local
    .filter((file) => remote.get(file.name) !== file.content)
    .map((file) => file.name)
    .sort();
}

function apiError(error: StatsError): StatsError {
  return error.code === "API_ERROR"
    ? error
    : new StatsError("API_ERROR", error.message, { cause: error });
}

function classifyGistError(error: unknown): Failure {
  if (error instanceof StatsError) {
    return fatal(error);
  }
  const http = HttpErrorSchema.safeParse(error);
  if (!http.success) {
    return unknownFailure(error);
  }
  const { status, response } = http.data;
  if (response !== undefined && status === 404) {
    return fatal(new StatsError("GIST_NOT_FOUND", "Gist not found (404)"));
  }
  const failure = classifyHttpError(http.data);
  if (
    response !== undefined &&
    status === 403 &&
    failure.error.code !== "RATE_LIMITED"
  ) {
    return fatal(
      new StatsError(
        "GIST_FORBIDDEN",
        "Access to the Gist denied (403): GH_TOKEN needs the gist scope and must belong to the Gist owner",
      ),
    );
  }
  return { ...failure, error: apiError(failure.error) };
}

class RawStatusError extends Error {
  readonly status: number;

  constructor(status: number) {
    super(`Gist raw file request failed (${status})`);
    this.status = status;
  }
}

function classifyRawError(error: unknown): Failure {
  if (error instanceof RawStatusError) {
    const failure = new StatsError("API_ERROR", error.message);
    return isTransientStatus(error.status)
      ? retryable(failure)
      : fatal(failure);
  }
  const message = error instanceof Error ? error.message : String(error);
  return retryable(networkError(message, error));
}

export async function pushToGist(options: PushOptions): Promise<string[]> {
  const { gistId, token, files, dryRun } = options;
  const fetchImpl = options.fetch ?? fetch;
  const { sleep } = options;
  const request = octokitRequest.defaults({
    headers: { authorization: `token ${token}` },
    request: { fetch: fetchImpl },
  });

  function retrying<T>(operation: () => Promise<T>): Promise<T> {
    return withRetry(operation, classifyGistError, sleep);
  }

  async function readContent(file: GistFile): Promise<string | undefined> {
    if (file.truncated !== true && typeof file.content === "string") {
      return file.content;
    }
    const url = file.raw_url;
    if (url === undefined || url === null) {
      return undefined;
    }
    return withRetry(
      async () => {
        const response = await fetchImpl(url);
        if (!response.ok) {
          throw new RawStatusError(response.status);
        }
        return response.text();
      },
      classifyRawError,
      sleep,
    );
  }

  const { data } = await retrying(() =>
    request("GET /gists/{gist_id}", { gist_id: gistId }),
  );
  const gist = GistSchema.safeParse(data);
  if (!gist.success) {
    throw new StatsError("RESPONSE_INVALID", "Unexpected Gist response shape");
  }

  const remote = new Map<string, string>();
  for (const file of files) {
    const remoteFile = Object.hasOwn(gist.data.files, file.name)
      ? gist.data.files[file.name]
      : undefined;
    const content =
      remoteFile === undefined ? undefined : await readContent(remoteFile);
    if (content !== undefined) {
      remote.set(file.name, content);
    }
  }

  const changed = diffFiles(files, remote);
  if (dryRun || changed.length === 0) {
    return changed;
  }

  const changedSet = new Set(changed);
  const payload = Object.fromEntries(
    files
      .filter((file) => changedSet.has(file.name))
      .map((file) => [file.name, { content: file.content }]),
  );
  await retrying(() =>
    request("PATCH /gists/{gist_id}", { gist_id: gistId, files: payload }),
  );
  return changed;
}
