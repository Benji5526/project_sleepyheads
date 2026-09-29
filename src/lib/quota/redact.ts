// 완료조건: "로그에 키가 찍히지 않는다". 쿼리스트링에 키를 넣는 공급자(OpenDART·공공데이터포털)가
// 있어 로그로 내보내기 전에 반드시 이 함수를 거친다.
const SENSITIVE_PARAMS = ["crtfc_key", "servicekey", "service_key", "key", "apikey"];

export function redactUrl(url: string | URL): string {
  const parsed = new URL(url);
  for (const name of Array.from(parsed.searchParams.keys())) {
    if (SENSITIVE_PARAMS.includes(name.toLowerCase())) {
      parsed.searchParams.set(name, "***");
    }
  }
  return parsed.toString();
}
