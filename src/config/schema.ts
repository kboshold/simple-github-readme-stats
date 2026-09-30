import { z } from "zod";
import { latte, mocha } from "./themes.ts";

const STATS_MIN_WIDTH_WITH_RANK = 420;

const hexColor = z
  .string()
  .regex(
    /^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/,
    "must be a 6 or 8 digit hex color without leading #",
  );

const width = z.number().int().min(300).max(600);

export const LoginSchema = z
  .string()
  .regex(/^[a-zA-Z0-9-]{1,39}$/, "must be a valid GitHub login");

export const RepoNameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9-]{1,39}\/[\w.-]+$/, "must match owner/name");

export const ThemeSchema = z.object({
  title: hexColor,
  icon: hexColor,
  text: hexColor,
  ring: hexColor,
  border: hexColor,
  background: hexColor,
});

export const StatsCardOptionsSchema = z
  .object({
    enabled: z.boolean().default(true),
    width: width.default(437),
    showIcons: z.boolean().default(true),
    hide: z
      .array(z.enum(["stars", "commits", "prs", "issues", "contributedTo"]))
      .default([]),
    hideRank: z.boolean().default(false),
    title: z.string().optional(),
  })
  .refine(
    (options) => options.hideRank || options.width >= STATS_MIN_WIDTH_WITH_RANK,
    {
      path: ["width"],
      message: `must be at least ${STATS_MIN_WIDTH_WITH_RANK} while the rank ring is shown`,
    },
  );

export const TopLangsCardOptionsSchema = z.object({
  enabled: z.boolean().default(true),
  width: width.default(320),
  count: z.number().int().min(1).max(20).default(8),
  hide: z.array(z.string()).default([]),
  title: z.string().optional(),
});

export const ConfigSchema = z.object({
  username: LoginSchema,
  orgs: z.array(LoginSchema).default([]),
  excludeRepos: z.array(RepoNameSchema).default([]),
  commitsWindow: z.enum(["all", "year"]).default("all"),
  gist: z.object({
    id: z
      .string()
      .regex(
        /^[0-9a-fA-F]{20,32}$/,
        "must be a hex string of 20-32 characters",
      ),
  }),
  themes: z
    .record(
      z.string().regex(/^[a-z0-9-]+$/, "theme key must match ^[a-z0-9-]+$"),
      ThemeSchema,
    )
    .refine((themes) => Object.keys(themes).length > 0, {
      message: "must have at least one entry",
    })
    .default({ dark: mocha, light: latte }),
  cards: z
    .object({
      stats: StatsCardOptionsSchema.prefault({}),
      topLangs: TopLangsCardOptionsSchema.prefault({}),
    })
    .prefault({}),
});

export type Theme = z.infer<typeof ThemeSchema>;
export type StatsCardOptions = z.infer<typeof StatsCardOptionsSchema>;
export type TopLangsCardOptions = z.infer<typeof TopLangsCardOptionsSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type ConfigInput = z.input<typeof ConfigSchema>;
