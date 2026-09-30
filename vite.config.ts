import { defineConfig, loadEnv } from "vite";
import { previewPlugin } from "./src/dev/vite-plugin.ts";

export default defineConfig(({ mode }) => ({
  root: "preview",
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
  },
  plugins: [previewPlugin(loadEnv(mode, process.cwd(), ""))],
}));
