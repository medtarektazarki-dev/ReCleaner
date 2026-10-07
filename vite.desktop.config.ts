import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, "desktop"),
  base: "./",
  plugins: [tailwindcss(), react()],
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
