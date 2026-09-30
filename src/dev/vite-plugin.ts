import { existsSync } from "node:fs";
import type {
  IncomingHttpHeaders,
  IncomingMessage,
  ServerResponse,
} from "node:http";
import { resolve, sep } from "node:path";
import type { Plugin, ViteDevServer } from "vite";
import { z } from "zod";
import type * as EnvModule from "../cli/env.ts";
import type * as ConfigModule from "../config/load.ts";
import type { StatsErrorCode } from "../errors.ts";
import type * as FetchModule from "../fetch/index.ts";
import type * as SnapshotModule from "../fetch/snapshot.ts";
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
const SnapshotModuleSchema = z.object({
  SNAPSHOT_PATH: z.string(),
  readSnapshot: exportedFunction<typeof SnapshotModule.readSnapshot>(),
  writeSnapshot: exportedFunction<typeof SnapshotModule.writeSnapshot>(),
});
const EnvModuleSchema = z.object({
  requireToken: exportedFunction<typeof EnvModule.requireToken>(),
});

export type SnapshotSource = "cache" | "fixture";

export interface ResolvedSnapshot {
  source: SnapshotSource;
  snapshot: SnapshotModule.Snapshot;
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

// ssrLoadModule yields its own StatsError class, so instanceof does not match
const CodedErrorSchema = z.object({
  name: z.literal("StatsError"),
  code: z.string(),
  message: z.string(),
});

export async function resolveSnapshot(
  cachePath: string,
  fixturePath: string,
  read: typeof SnapshotModule.readSnapshot,
): Promise<ResolvedSnapshot> {
  try {
    return { source: "cache", snapshot: await read(cachePath) };
  } catch (error) {
    if (!CodedErrorSchema.safeParse(error).success) {
      throw error;
    }
  }
  return { source: "fixture", snapshot: await read(fixturePath) };
}

const ALLOWED_FETCH_SITES = new Set(["same-origin", "none"]);

export function isSameOriginRequest(headers: IncomingHttpHeaders): boolean {
  const site = headers["sec-fetch-site"];
  return site === undefined || ALLOWED_FETCH_SITES.has(site);
}

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
  const fixturePath = resolve(projectRoot, FIXTURE_PATH);

  let refreshing: Promise<SnapshotModule.Snapshot> | null = null;

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

      async function loadSnapshotModule() {
        const module = SnapshotModuleSchema.parse(
          await server.ssrLoadModule(resolve(srcDir, "fetch/snapshot.ts")),
        );
        return {
          ...module,
          cachePath: resolve(projectRoot, module.SNAPSHOT_PATH),
        };
      }

      async function loadEnvModule() {
        return EnvModuleSchema.parse(
          await server.ssrLoadModule(resolve(srcDir, "cli/env.ts")),
        );
      }

      async function renderFiles(): Promise<{
        resolved: ResolvedSnapshot;
        files: RenderModule.OutputFile[];
      }> {
        const [{ renderAll }, { loadConfig }, { readSnapshot, cachePath }] =
          await Promise.all([
            loadRender(),
            loadConfigModule(),
            loadSnapshotModule(),
          ]);
        const config = await loadConfig(env);
        const resolved = await resolveSnapshot(
          cachePath,
          fixturePath,
          readSnapshot,
        );
        return { resolved, files: renderAll(resolved.snapshot, config) };
      }

      function refresh(token: string): Promise<SnapshotModule.Snapshot> {
        refreshing ??= (async () => {
          const [
            { loadConfig },
            { fetchSnapshot },
            { writeSnapshot, cachePath },
          ] = await Promise.all([
            loadConfigModule(),
            loadFetch(),
            loadSnapshotModule(),
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
        const { requireToken } = await loadEnvModule();
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
          if (!isSameOriginRequest(req.headers)) {
            sendError(
              res,
              403,
              "ORIGIN_FORBIDDEN",
              "Refresh is only allowed from the preview page",
            );
            return true;
          }
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

      fetchIfCacheMissing().catch((error: unknown) => {
        server.config.logger.error(
          `[preview] fetch failed: ${describeError(error)}`,
        );
      });

      async function fetchIfCacheMissing(): Promise<void> {
        if ((env.GH_TOKEN?.trim() ?? "") === "") {
          return;
        }
        const [{ cachePath }, { requireToken }] = await Promise.all([
          loadSnapshotModule(),
          loadEnvModule(),
        ]);
        if (existsSync(cachePath)) {
          return;
        }
        const logger = server.config.logger;
        logger.info("[preview] no snapshot cache, fetching once");
        await refresh(requireToken(env));
        logger.info("[preview] snapshot fetched");
        server.ws.send({ type: "full-reload" });
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
