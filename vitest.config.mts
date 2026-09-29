import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // tsconfig.json의 "@/*" 경로 별칭을 테스트에서도 쓴다
    tsconfigPaths: true,
    // server-only는 브라우저 번들 방지용이라 테스트(Node)에서는 빈 모듈로 바꾼다
    alias: {
      "server-only": fileURLToPath(new URL("./tests/unit/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/accuracy/**/*.test.ts"],
    environment: "node",
  },
});
