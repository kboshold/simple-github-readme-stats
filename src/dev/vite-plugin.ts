import { existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve, sep } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { z } from "zod";
import { requireToken } from "../cli/env.ts";
import type * as ConfigModule from "../config/load.ts";
import { StatsError, type StatsErrorCode } from "../errors.ts";
import type * as FetchModule from "../fetch/index.ts";
import {
  readSnapshot,
  SNAPSHOT_PATH,
  type Snapshot,
  writeSnapshot,
} from "../fetch/snapshot.ts";
import type * as RenderModule from "../render/index.ts";

export const FIXTURE_PATH = "fixtures/data.json";

function exportedFunction<T>() {
  return z.custom<T>((value) => typeof value === "function");
}

const RenderModuleSchema = z.object({
  renderAll: exportedFunction<typeof RenderModule.renderAll>(),
});
const ConfigModuleSchema = z.object({
  loadConfig: exportedFunction<typeof ConfigModule.loadConfig>(),
});
const FetchModuleSchema = z.object({
  fetchSnapshot: exportedFunction<typeof FetchModule.fetchSnapshot>(),
});

export type SnapshotSource = "cache" | "fixture";

export interface ResolvedSnapshot {
  source: SnapshotSource;
  snapshot: Snapshot;
}

export interface StatusResponse {
  source: SnapshotSource;
  fetchedAt: string;
  files: string[];
}

export interface RefreshResponse {
  fetchedAt: string;
}

export interface ErrorResponse {
  error: {
    code: StatsErrorCode;
    message: string;
  };
}

export async function resolveSnapshot(
  cachePath: string,
  fixturePath: string,
): Promise<ResolvedSnapshot> {
  try {
    return { source: "cache", snapshot: await readSnapshot(cachePath) };
  } catch (error) {
    if (!(error instanceof StatsError)) {
      throw error;
    }
  }
  return { source: "fixture", snapshot: await readSnapshot(fixturePath) };
}

// ssrLoadModule yields its own StatsError class, so instanceof does not match
const CodedErrorSchema = z.object({
  name: z.literal("StatsError"),
  code: z.string(),
  message: z.string(),
});

function describeError(error: unknown): string {
  const coded = CodedErrorSchema.safeParse(error);
  if (coded.success) {
    return `${coded.data.code}: ${coded.data.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: StatusResponse | RefreshResponse | ErrorResponse,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function sendError(
  res: ServerResponse,
  status: number,
  code: StatsErrorCode,
  message: string,
): void {
  sendJson(res, status, { error: { code, message } });
}

export function previewPlugin(env: Record<string, string>): Plugin {
  const projectRoot = process.cwd();
  const srcDir = resolve(projectRoot, "src");
  const statsConfigPath = resolve(projectRoot, "stats.config.ts");
  const cachePath = resolve(projectRoot, SNAPSHOT_PATH);
  const fixturePath = resolve(projectRoot, FIXTURE_PATH);

  let refreshing: Promise<Snapshot> | null = null;

  return {
    name: "stats-preview",
    configureServer(server) {
      async function loadRender() {
        return RenderModuleSchema.parse(
          await server.ssrLoadModule(resolve(srcDir, "render/index.ts")),
        );
      }

      async function loadConfigModule() {
        return ConfigModuleSchema.parse(
          await server.ssrLoadModule(resolve(srcDir, "config/load.ts")),
        );
      }

      async function loadFetch() {
        return FetchModuleSchema.parse(
          await server.ssrLoadModule(resolve(srcDir, "fetch/index.ts")),
        );
      }

      async function renderFiles(): Promise<{
        resolved: ResolvedSnapshot;
        files: RenderModule.OutputFile[];
      }> {
        const [{ renderAll }, { loadConfig }] = await Promise.all([
          loadRender(),
          loadConfigModule(),
        ]);
        const config = await loadConfig(env);
        const resolved = await resolveSnapshot(cachePath, fixturePath);
        return { resolved, files: renderAll(resolved.snapshot, config) };
      }

      function refresh(token: string): Promise<Snapshot> {
        refreshing ??= (async () => {
          const [{ loadConfig }, { fetchSnapshot }] = await Promise.all([
            loadConfigModule(),
            loadFetch(),
          ]);
          const config = await loadConfig(env);
          const snapshot = await fetchSnapshot(config, token);
          await writeSnapshot(cachePath, snapshot);
          return snapshot;
        })().finally(() => {
          refreshing = null;
        });
        return refreshing;
      }

      async function handleCard(
        file: string,
        res: ServerResponse,
      ): Promise<void> {
        let files: RenderModule.OutputFile[];
        try {
          ({ files } = await renderFiles());
        } catch (error) {
          sendError(res, 500, "RENDER_FAILED", describeError(error));
          return;
        }
        const match = files.find((entry) => entry.name === file);
        if (match === undefined) {
          sendError(res, 404, "CARD_NOT_FOUND", `Unknown card file: ${file}`);
          return;
        }
        res.statusCode = 200;
        res.setHeader("Content-Type", "image/svg+xml");
        res.setHeader("Cache-Control", "no-store");
        res.end(match.content);
      }

      async function handleStatus(res: ServerResponse): Promise<void> {
        try {
          const { resolved, files } = await renderFiles();
          sendJson(res, 200, {
            source: resolved.source,
            fetchedAt: resolved.snapshot.fetchedAt,
            files: files.map((entry) => entry.name),
          });
        } catch (error) {
          sendError(res, 500, "RENDER_FAILED", describeError(error));
        }
      }

      async function handleRefresh(res: ServerResponse): Promise<void> {
        let token: string;
        try {
          token = requireToken(env);
        } catch {
          sendError(res, 400, "TOKEN_MISSING", "GH_TOKEN is not set");
          return;
        }
        try {
          const snapshot = await refresh(token);
          sendJson(res, 200, { fetchedAt: snapshot.fetchedAt });
        } catch (error) {
          sendError(res, 502, "FETCH_FAILED", describeError(error));
        }
      }

      async function handle(
        req: IncomingMessage,
        res: ServerResponse,
      ): Promise<boolean> {
        const { pathname } = new URL(req.url ?? "/", "http://localhost");
        const cardMatch = /^\/cards\/([^/]+\.svg)$/.exec(pathname);
        if (req.method === "GET" && cardMatch?.[1] !== undefined) {
          await handleCard(cardMatch[1], res);
          return true;
        }
        if (req.method === "GET" && pathname === "/api/status") {
          await handleStatus(res);
          return true;
        }
        if (req.method === "POST" && pathname === "/api/refresh") {
          await handleRefresh(res);
          return true;
        }
        return false;
      }

      server.middlewares.use((req, res, next) => {
        handle(req, res).then(
          (handled) => {
            if (!handled) {
              next();
            }
          },
          (error: unknown) => next(error),
        );
      });

      watchSources(server, srcDir, statsConfigPath);

      if (!existsSync(cachePath) && (env.GH_TOKEN?.trim() ?? "") !== "") {
        const logger = server.config.logger;
        logger.info("[preview] no snapshot cache, fetching once");
        refresh(requireToken(env)).then(
          () => {
            logger.info("[preview] snapshot fetched");
            server.ws.send({ type: "full-reload" });
          },
          (error: unknown) => {
            logger.error(`[preview] fetch failed: ${describeError(error)}`);
          },
        );
      }
    },
  };
}

function watchSources(
  server: ViteDevServer,
  srcDir: string,
  statsConfigPath: string,
): void {
  server.watcher.add([srcDir, statsConfigPath]);
  const isRelevant = (path: string): boolean =>
    path === statsConfigPath || path.startsWith(`${srcDir}${sep}`);
  const reload = (path: string): void => {
    if (isRelevant(resolve(path))) {
      server.ws.send({ type: "full-reload" });
    }
  };
  server.watcher.on("change", reload);
  server.watcher.on("add", reload);
  server.watcher.on("unlink", reload);
}
