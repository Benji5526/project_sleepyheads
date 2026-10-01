import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// WU-403 무거운 측정 전용 설정 — `pnpm test`·CI에는 들어가지 않는다 (루트 vitest.config.ts는 tests/unit·accuracy만).
// 실행: npx vitest run -c tests/perf/vitest.config.ts
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("../unit/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/perf/**/*.perf.test.ts"],
    environment: "node",
    testTimeout: 600_000,
    hookTimeout: 600_000,
    // 측정이 서로 CPU를 나눠 쓰지 않게 한 번에 하나씩
    fileParallelism: false,
  },
});
