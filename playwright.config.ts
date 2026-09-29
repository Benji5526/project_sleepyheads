import { defineConfig, devices } from "@playwright/test";

// 개발 서버(3000)와 겹치지 않는 포트
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "on-first-retry",
  },
  // 화면 완료 기준: 데스크톱 1280px, 휴대폰 375px (HANDOFF §7.2)
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 375, height: 812 } },
    },
  ],
  // 화면 테스트는 항상 가짜 모드로 빌드한 앱에서 돌린다 (서버 API·외부 키 없이 같은 결과)
  webServer: {
    command: `pnpm build && pnpm start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { NEXT_PUBLIC_API_MOCK: "1" },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
