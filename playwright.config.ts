import { defineConfig, devices } from "@playwright/test";

// 개발 서버(3000)와 겹치지 않는 포트
const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // CI에서도 테스트마다 한 줄씩 찍어, 멈추면 어디서 멈췄는지 로그로 보이게 한다
  reporter: process.env.CI ? [["list"], ["github"]] : "list",
  // 전체가 8분을 넘으면 실패로 끝낸다 (멈춘 채 CI 시간을 다 쓰지 않게)
  globalTimeout: 8 * 60_000,
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
  // 화면 테스트는 항상 가짜 모드로 빌드한 앱에서 돌린다 (서버 API·외부 키 없이 같은 결과).
  // pnpm을 거치지 않고 next를 바로 띄워, 테스트가 끝나면 서버가 확실히 함께 꺼지게 한다.
  webServer: {
    command: `node node_modules/next/dist/bin/next build && node node_modules/next/dist/bin/next start -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    env: { NEXT_PUBLIC_API_MOCK: "1" },
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
