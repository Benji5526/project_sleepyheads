import { defineConfig, devices } from "@playwright/test";

const PORT = 3000;

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
  // CI에서는 빌드된 앱을, 로컬에서는 개발 서버를 띄워 테스트한다.
  // CI는 next를 직접 실행한다: pnpm start로 띄우면 테스트가 끝난 뒤 종료 신호가
  // next-server 자식 프로세스까지 가지 않아 Playwright가 서버 종료를 끝없이 기다린다.
  webServer: {
    command: process.env.CI ? "node_modules/.bin/next start" : "pnpm dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
