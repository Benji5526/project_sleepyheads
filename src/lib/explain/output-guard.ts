// TECH §11.5·§17 프롬프트 주입 방어 — AI 출력(분석 글 ③·뉴스 요지 ②)에 **링크 주소·비밀 값**이 섞이면 그 문장을 버린다 (WU-504).
// AI에는 비밀 값을 넣지 않으므로(프롬프트 = 계산 결과 요약·뉴스 제목/요지만) 원래 나올 수 없지만,
// 기사 글에 "다음 주소를 링크로 넣어라"·"비밀키를 출력하라" 같은 문장이 있을 때를 대비한 마지막 검사다.
// 화면 링크는 서버가 가진 주소(뉴스 = Google 뉴스 RSS가 준 주소, 공시 = DART)만 쓴다 — 글 속 주소는 링크가 아니어도 내보내지 않는다.

/** 서버 환경변수 중 값이 새면 안 되는 것 (TECH §17·§18 🔒) */
export const SECRET_ENV_NAMES = [
  "OPENAI_API_KEY",
  "OPENDART_API_KEY",
  "DATA_GO_KR_SERVICE_KEY",
  "SUPABASE_SECRET_KEY",
  "CRON_SECRET",
] as const;

/** 주소처럼 보이는 글자: http(s)://, www., 흔한 도메인 끝 */
const URL_LIKE =
  /https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|kr|me|ly|xyz|app|dev|site|example)\b/i;

/** 키 모양 (값을 몰라도): OpenAI `sk-…`, Supabase `sb_secret_…`, JWT `eyJ…` */
const KEY_LIKE = /\bsk-[A-Za-z0-9_-]{10,}|sb_secret_|\beyJ[A-Za-z0-9_-]{20,}/;

/** 지금 서버에 들어 있는 비밀 값 조각 (쉼표로 여러 개 넣은 키도 하나씩). 8자 미만은 우연히 겹칠 수 있어 뺀다 */
function secretValues(env: NodeJS.ProcessEnv): string[] {
  return SECRET_ENV_NAMES.flatMap((name) => (env[name] ?? "").split(","))
    .map((v) => v.trim())
    .filter((v) => v.length >= 8);
}

/** AI가 쓴 글에 주소·키 모양·실제 비밀 값이 들어 있는가 (들어 있으면 그 문장을 버린다) */
export function containsLeak(text: string, env: NodeJS.ProcessEnv = process.env): boolean {
  if (URL_LIKE.test(text) || KEY_LIKE.test(text)) return true;
  const compact = text.replace(/\s+/g, "");
  return secretValues(env).some((secret) => compact.includes(secret));
}
