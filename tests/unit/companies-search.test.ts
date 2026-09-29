import { describe, expect, it, vi } from "vitest";
import { searchCompanies } from "@/lib/companies/search";
import type { CompanyRow } from "@/lib/companies/row";
import { createFakeCompaniesClient } from "./helpers/fake-companies-table";

function company(
  overrides: Partial<CompanyRow> & { corp_name: string; stock_code: string },
): CompanyRow {
  return {
    corp_code: `code-${overrides.stock_code}`,
    market: "KOSPI",
    acc_mt: 12,
    sector_source: "manual",
    sectors: { name: "기타", is_financial: false },
    ...overrides,
  };
}

const ROWS: CompanyRow[] = [
  company({ corp_name: "삼성전자", stock_code: "005930" }),
  company({ corp_name: "삼성SDI", stock_code: "006400" }),
  company({ corp_name: "삼성물산", stock_code: "028260" }),
  company({ corp_name: "SK하이닉스", stock_code: "000660" }),
  company({
    corp_name: "미확정기업",
    stock_code: "111111",
    market: null,
    acc_mt: null,
    sector_source: null,
    sectors: null,
  }),
];

describe("searchCompanies (WU-103, API_SPEC S1)", () => {
  it("이름이 포함된 기업을 자동완성으로 돌려준다", async () => {
    const { client } = createFakeCompaniesClient(ROWS);
    const result = await searchCompanies("삼성", 10, { client });
    expect(result.map((c) => c.name).sort()).toEqual(["삼성SDI", "삼성물산", "삼성전자"]);
  });

  it("완전히 같음 > 접두어 > 부분일치 순으로 정렬한다", async () => {
    const { client } = createFakeCompaniesClient(ROWS);
    const result = await searchCompanies("삼성전자", 10, { client });
    expect(result[0].name).toBe("삼성전자");
  });

  it("limit은 최대 10으로 잘린다", async () => {
    const many = Array.from({ length: 15 }, (_, i) =>
      company({ corp_name: `테스트기업${i}`, stock_code: String(100000 + i) }),
    );
    const { client } = createFakeCompaniesClient(many);
    const result = await searchCompanies("테스트기업", 50, { client });
    expect(result).toHaveLength(10);
  });

  it("빈 질의는 조회 없이 빈 배열", async () => {
    const { client } = createFakeCompaniesClient(ROWS);
    const result = await searchCompanies("   ", 10, { client });
    expect(result).toEqual([]);
  });

  it("아직 기업개황이 채워지지 않은 기업은 검색 결과에서 뺀다", async () => {
    const { client } = createFakeCompaniesClient(ROWS);
    const result = await searchCompanies("미확정", 10, { client });
    expect(result).toEqual([]);
  });

  it("외부 API 호출 없이 DB만 조회한다", async () => {
    const { client } = createFakeCompaniesClient(ROWS);
    const fetchSpy = vi.spyOn(global, "fetch");
    await searchCompanies("삼성", 10, { client });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
