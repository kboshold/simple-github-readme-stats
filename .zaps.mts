import type { Library } from "zaps";

export function config({ define }: Library) {
  return define({
    name: "simple-github-readme-stats",
    services: {
      preview: {
        start: "pnpm dev",
        ready: { port: 5173 },
        url: "http://localhost:5173",
      },
    },
  });
}
