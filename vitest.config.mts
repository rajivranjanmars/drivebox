import path from "node:path";
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
  },
  plugins: [
    cloudflareTest(async () => ({
      main: "./test/worker.ts",
      wrangler: {
        configPath: "./wrangler.jsonc",
      },
      miniflare: {
        // Keep tests on the same newest workerd date supported by the Cloudflare Vite toolchain.
        compatibilityDate: "2026-08-08",
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(path.join(import.meta.dirname, "migrations")),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
  },
});
