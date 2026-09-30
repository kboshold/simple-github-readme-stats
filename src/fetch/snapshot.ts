import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { z } from "zod";
import { StatsError } from "../errors.ts";

export const SNAPSHOT_PATH = ".cache/data.json";
export const SNAPSHOT_SCHEMA_VERSION = 1;

const count = z.number().int().nonnegative();

export const languageStatSchema = z.strictObject({
  name: z.string(),
  color: z
    .string()
    .regex(/^[0-9a-fA-F]{6}$/)
    .nullable(),
  bytes: count,
});

export const snapshotSchema = z.strictObject({
  schemaVersion: z.literal(SNAPSHOT_SCHEMA_VERSION),
  fetchedAt: z.iso.datetime(),
  user: z.strictObject({
    login: z.string(),
    name: z.string().nullable(),
    followers: count,
  }),
  totals: z.strictObject({
    stars: count,
    commits: count,
    prs: count,
    issues: count,
    reviews: count,
    contributedTo: count,
  }),
  languages: z.array(languageStatSchema),
});

export type LanguageStat = z.infer<typeof languageStatSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;

const NodeErrorSchema = z.object({ code: z.string() });

function describeIssues(error: z.ZodError): string {
  const paths = error.issues.map(
    (issue) => issue.path.map(String).join(".") || "(root)",
  );
  return [...new Set(paths)].join(", ");
}

export async function writeSnapshot(
  path: string,
  snapshot: Snapshot,
): Promise<void> {
  const parsed = snapshotSchema.safeParse(snapshot);
  if (!parsed.success) {
    throw new StatsError(
      "SNAPSHOT_INVALID",
      `Refusing to write an invalid snapshot: ${describeIssues(parsed.error)}`,
    );
  }
  const dir = dirname(path);
  const tempPath = join(dir, `.${basename(path)}.${randomUUID()}.tmp`);
  await mkdir(dir, { recursive: true });
  try {
    await writeFile(tempPath, `${JSON.stringify(parsed.data, null, 2)}\n`);
    await rename(tempPath, path);
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

export async function readSnapshot(path: string): Promise<Snapshot> {
  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    const nodeError = NodeErrorSchema.safeParse(error);
    if (nodeError.success && nodeError.data.code === "ENOENT") {
      throw new StatsError("SNAPSHOT_MISSING", `Snapshot not found: ${path}`);
    }
    throw error;
  }

  let raw: unknown;
  try {
    raw = JSON.parse(content);
  } catch {
    throw new StatsError("SNAPSHOT_INVALID", `Snapshot is not JSON: ${path}`);
  }

  const parsed = snapshotSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StatsError(
      "SNAPSHOT_INVALID",
      `Snapshot ${path} is invalid at: ${describeIssues(parsed.error)}`,
    );
  }
  return parsed.data;
}
