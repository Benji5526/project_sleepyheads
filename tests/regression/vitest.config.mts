import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// WU-503 회귀 세트 전용 설정 — AI는 고정 응답(비용 0)이라 CI(.github/workflows/regression.yml)에서 돈다.
// 실행: pnpm exec vitest run -c tests/regression/vitest.config.mts
// 실제 AI 범위 판정(1회, 비용 발생)은 scripts/regression-scope-live.test.ts — 여기에 들어가지 않는다.
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("../unit/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/regression/**/*.test.ts"],
    environment: "node",
  },
});
