import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    root: "./",
    include: ["src/**/*.spec.ts", "test/**/*.e2e-spec.ts"],
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    // Real Postgres integration tests share one database — running them
    // in parallel would corrupt each other's state.
    fileParallelism: false,
    hookTimeout: 20_000,
    testTimeout: 20_000,
  },
  plugins: [
    // NestJS relies on emitDecoratorMetadata for constructor-based DI,
    // which esbuild (Vitest's default transform) does not reliably
    // support. SWC does — this is NestJS's own recommended Vitest setup.
    swc.vite(),
  ],
});
