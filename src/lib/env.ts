import "server-only";

// 서버 전용 환경변수 읽기. 값이 없으면 바로 실패시켜 설정 누락을 숨기지 않는다.
// 변수 목록은 .env.example (API_SPEC §8.3).
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `환경변수 ${name}이(가) 없습니다. .env.local을 확인하세요 (.env.example 참고).`,
    );
  }
  return value;
}
