import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Tests unitaires (logique pure : règles vidéo, validation). `npm test`
export default defineConfig({
  // JSX automatique (comme Next) : le renderer V2 (satori) peut tourner sous vitest / vite-node.
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./", import.meta.url)) } },
  test: { include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"], environment: "node" },
});
