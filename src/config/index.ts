import type { ConfigInput } from "./schema.ts";

export type {
  Config,
  ConfigInput,
  StatsCardOptions,
  Theme,
  TopLangsCardOptions,
} from "./schema.ts";
export { latte, mocha } from "./themes.ts";

export function defineConfig(input: ConfigInput): ConfigInput {
  return input;
}
