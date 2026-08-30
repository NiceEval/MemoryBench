import { defineConfig } from "astro/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root,
  srcDir: resolve(root, "src"),
  publicDir: resolve(root, "public"),
  output: "static",
  outDir: resolve(root, "../site"),
  vite: {
    ssr: {
      external: ["effect", "niceeval/inspection", "niceeval/inspection/host"],
    },
  },
});
