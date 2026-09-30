// 실제 API로 도는 라이브 회귀 스크립트 전용 설정 (scripts/regression-live.test.ts).
// 일부러 vitest.config.ts와 분리했다 — pnpm test·CI는 여전히 vitest.config.ts만 쓰므로
// 이 파일을 --config로 명시하지 않는 한 라이브 호출이 섞여 들어가지 않는다.
// 실행: pnpm vitest run --config vitest.regression.config.ts
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": fileURLToPath(new URL("./tests/unit/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["scripts/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
    hookTimeout: 30_000,
  },
});
