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
    // 20s was tight enough that a heavy concurrency e2e test (25
    // simultaneous rental-creation requests) tripped hookTimeout on a
    // loaded CI runner, leaving the following test's cleanDatabase() call
    // racing against still-in-flight writes from the timed-out request.
    hookTimeout: 40_000,
    testTimeout: 40_000,
  },
  plugins: [
    // NestJS relies on emitDecoratorMetadata for constructor-based DI,
    // which esbuild (Vitest's default transform) does not reliably
    // support. SWC does — this is NestJS's own recommended Vitest setup.
    swc.vite(),
  ],
});
