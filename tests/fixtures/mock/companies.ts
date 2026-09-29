// 가짜 기업 목록 (S1 /api/search 흉내). corpCode는 실제 DART 고유번호가 아닌 가짜 값이다.
import type { CompanyRef } from "@/contracts";

function company(
  corpCode: string,
  stockCode: string,
  name: string,
  market: CompanyRef["market"],
  sectorName: string,
  isFinancial = false,
  fiscalMonth = 12,
): CompanyRef {
  return {
    corpCode,
    stockCode,
    name,
    market,
    sector: { name: sectorName, source: "manual", isFinancial },
    fiscalMonth,
  };
}

export const MOCK_COMPANIES: CompanyRef[] = [
  company("90000001", "005930", "삼성전자", "KOSPI", "반도체"),
  company("90000002", "000660", "SK하이닉스", "KOSPI", "반도체"),
  company("90000003", "006400", "삼성SDI", "KOSPI", "2차전지"),
  company("90000004", "207940", "삼성바이오로직스", "KOSPI", "바이오"),
  company("90000005", "028260", "삼성물산", "KOSPI", "지주·건설"),
  company("90000006", "005380", "현대차", "KOSPI", "자동차"),
  company("90000007", "012330", "현대모비스", "KOSPI", "자동차부품"),
  company("90000008", "105560", "KB금융", "KOSPI", "금융지주", true),
  company("90000009", "035720", "카카오", "KOSPI", "인터넷"),
  company("90000010", "035420", "NAVER", "KOSPI", "인터넷"),
  company("90000011", "373220", "LG에너지솔루션", "KOSPI", "2차전지"),
  company("90000012", "247540", "에코프로비엠", "KOSDAQ", "2차전지"),
];

export function findMockCompany(name: string): CompanyRef {
  const found = MOCK_COMPANIES.find((c) => c.name === name);
  if (!found) throw new Error(`가짜 기업 목록에 없음: ${name}`);
  return found;
}
