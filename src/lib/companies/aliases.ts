// 자주 쓰는 줄임말 → 정식 이름. 질문 해석(resolveCompany)과 기업 찾기(searchCompanies, S1) 둘 다 쓴다.
/**
 * 자주 쓰는 줄임말 → 상장사 정식 이름 (`companies.corp_name`, 2026-09-30 운영 DB로 확인).
 * "현대차"로 찾으면 이름에 "현대차"가 들어간 **현대차증권**만 걸려 그대로 확정되던 버그(2026-09-30 실제 API).
 */
export const COMPANY_ALIASES: Record<string, string> = {
  현대차: "현대자동차",
  기아차: "기아",
  삼전: "삼성전자",
  하이닉스: "SK하이닉스",
  sk하닉: "SK하이닉스",
  네이버: "NAVER",
  엘지전자: "LG전자",
  엘지화학: "LG화학",
  엔솔: "LG에너지솔루션",
  lg엔솔: "LG에너지솔루션",
  포스코: "POSCO홀딩스",
  포스코홀딩스: "POSCO홀딩스",
  카뱅: "카카오뱅크",
  삼바: "삼성바이오로직스",
  skt: "SK텔레콤",
};

/** 줄임말이면 정식 이름으로 (띄어쓰기·대소문자 무시). 아니면 그대로 */
export function canonicalCompanyName(name: string): string {
  return COMPANY_ALIASES[name.replace(/\s+/g, "").toLowerCase()] ?? name;
}
