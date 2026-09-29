import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig.json의 "@/*" 경로 별칭을 테스트에서도 쓴다
  resolve: { tsconfigPaths: true },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/accuracy/**/*.test.ts"],
    environment: "node",
  },
});
