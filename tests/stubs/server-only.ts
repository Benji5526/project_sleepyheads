// vitest용 "server-only" 대체 모듈.
// 실제 패키지는 Next.js 번들러의 "react-server" 조건을 이용해 브라우저 번들에서만 오류를 내는데,
// vitest(plain Node)에서는 그 조건이 없어 항상 오류를 던진다. 테스트에서는 빈 모듈로 바꿔 넣는다
// (vitest.config.mts의 resolve.alias 참고).
export {};
