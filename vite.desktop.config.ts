import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { thirdPartyNotices } from "./desktop/notices-plugin.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));

export default defineConfig({
  root: path.join(root, "desktop"),
  base: "./",
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [tailwindcss(), react(), thirdPartyNotices()],
  resolve: {
    tsconfigPaths: true,
    alias: [
      { find: "@/lib/recleaner/actions", replacement: path.join(root, "desktop/shims/actions.ts") },
      { find: "@tanstack/react-start", replacement: path.join(root, "desktop/shims/start.ts") },
      { find: "@", replacement: path.join(root, "src") },
    ],
  },
  build: {
    outDir: path.join(root, "desktop/build/ui"),
    emptyOutDir: true,
    assetsDir: "assets",
  },
});
