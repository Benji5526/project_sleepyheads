import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    // server-only는 브라우저 번들 방지용이라 테스트(Node)에서는 빈 모듈로 바꾼다.
    alias: {
      "server-only": fileURLToPath(
        new URL("./tests/unit/stubs/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/unit/**/*.test.{ts,tsx}"],
  },
});
