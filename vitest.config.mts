import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig.json의 "@/*" 경로 별칭을 테스트에서도 쓴다
    tsconfigPaths: true,
    alias: {
      // "server-only"는 Next.js 번들러의 "react-server" 조건에 기대 브라우저 번들만 막는데,
      // vitest(plain Node)에는 그 조건이 없어 항상 오류를 던진다 → 테스트에서는 빈 모듈로 대체.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/accuracy/**/*.test.ts"],
    environment: "node",
  },
});
