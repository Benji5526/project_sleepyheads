// 화면 개발용 가짜 모드 스위치.
// 서버 API(/api/*)가 완성되기 전에 tests/fixtures/mock/의 가짜 JSON으로 화면을 만들기 위한 것이다.
// - .env.local에 NEXT_PUBLIC_API_MOCK=1 을 넣었을 때만 켜진다.
// - Vercel 운영(Production) 배포에서는 값이 있어도 절대 켜지지 않는다 (가짜 결과 표시 금지, PRD F-N7).
export const MOCK_MODE =
  process.env.NEXT_PUBLIC_API_MOCK === "1" && process.env.NEXT_PUBLIC_VERCEL_ENV !== "production";
