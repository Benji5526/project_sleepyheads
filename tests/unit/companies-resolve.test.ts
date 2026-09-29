import { describe, expect, it } from "vitest";
import { resolveCompany } from "@/lib/companies/resolve";
import type { CompanyRow } from "@/lib/companies/row";
import { createFakeCompaniesClient } from "./helpers/fake-companies-table";

const SEMICONDUCTOR = { name: "반도체", is_financial: false };

const SK_HYNIX: CompanyRow = {
  corp_code: "00164779",
  stock_code: "000660",
  corp_name: "SK하이닉스",
  market: "KOSPI",
  acc_mt: 12,
  sector_source: "manual",
  sectors: SEMICONDUCTOR,
};

const SAMSUNG: CompanyRow = {
  corp_code: "00126380",
  stock_code: "005930",
  corp_name: "삼성전자",
  market: "KOSPI",
  acc_mt: 12,
  sector_source: "induty_code",
  sectors: SEMICONDUCTOR,
};

const SAMSUNG_PREFERRED: CompanyRow = {
  corp_code: "00126381",
  stock_code: "005935",
  corp_name: "삼성전자우",
  market: "KOSPI",
  acc_mt: 12,
  sector_source: "induty_code",
  sectors: SEMICONDUCTOR,
};

const HYUNDAI_MOTOR: CompanyRow = {
  corp_code: "00164742",
  stock_code: "005380",
  corp_name: "현대차",
  market: "KOSPI",
  acc_mt: 12,
  sector_source: "induty_code",
  sectors: { name: "자동차/부품", is_financial: false },
};

const HYUNDAI_ENGINEERING: CompanyRow = {
  corp_code: "00164780",
  stock_code: "000720",
  corp_name: "현대건설",
  market: "KOSPI",
  acc_mt: 12,
  sector_source: "induty_code",
  sectors: { name: "건설", is_financial: false },
};

/** WU-104(기업개황)가 아직 채우지 않은 기업 — market·섹터·결산월이 없다. */
const NOT_YET_ENRICHED: CompanyRow = {
  corp_code: "00999999",
  stock_code: "999999",
  corp_name: "새싹기업",
  market: null,
  acc_mt: null,
  sector_source: null,
  sectors: null,
};

const ALL_ROWS = [
  SK_HYNIX,
  SAMSUNG,
  SAMSUNG_PREFERRED,
  HYUNDAI_MOTOR,
  HYUNDAI_ENGINEERING,
  NOT_YET_ENRICHED,
];

describe("resolveCompany (WU-103, TECH §4.4)", () => {
  it("6자리 종목코드는 정확히 확정한다 — 005930 → 삼성전자", async () => {
    const { client } = createFakeCompaniesClient(ALL_ROWS);
    const result = await resolveCompany("005930", { client });
    expect(result).toEqual({
      type: "resolved",
      company: expect.objectContaining({ name: "삼성전자" }),
    });
  });

  it("흔한 줄임말(부분일치)이 하나뿐이면 확정한다 — 하이닉스 → SK하이닉스", async () => {
    const { client } = createFakeCompaniesClient(ALL_ROWS);
    const result = await resolveCompany("하이닉스", { client });
    expect(result).toEqual({
      type: "resolved",
      company: expect.objectContaining({ name: "SK하이닉스" }),
    });
  });

  it("후보가 여럿이면 후보 목록을 돌려준다 — 현대", async () => {
    const { client } = createFakeCompaniesClient(ALL_ROWS);
    const result = await resolveCompany("현대", { client });
    expect(result.type).toBe("candidates");
    if (result.type === "candidates") {
      expect(result.candidates.map((c) => c.name).sort()).toEqual(["현대건설", "현대차"]);
    }
  });

  it("정확히 일치하는 이름이 있으면 부분일치로 더 걸리더라도 그것만 확정한다 — 삼성전자", async () => {
    const { client } = createFakeCompaniesClient(ALL_ROWS);
    const result = await resolveCompany("삼성전자", { client });
    expect(result).toEqual({
      type: "resolved",
      company: expect.objectContaining({ name: "삼성전자", stockCode: "005930" }),
    });
  });

  it("존재하지 않는 이름은 not_found", async () => {
    const { client } = createFakeCompaniesClient(ALL_ROWS);
    const result = await resolveCompany("존재하지않는기업이름", { client });
    expect(result).toEqual({ type: "not_found" });
  });

  it("존재하지 않는 종목코드는 not_found", async () => {
    const { client } = createFakeCompaniesClient(ALL_ROWS);
    const result = await resolveCompany("123456", { client });
    expect(result).toEqual({ type: "not_found" });
  });

  it("아직 기업개황이 채워지지 않은 기업은 확정하지 않는다(not_found)", async () => {
    const { client } = createFakeCompaniesClient(ALL_ROWS);
    const result = await resolveCompany("새싹기업", { client });
    expect(result).toEqual({ type: "not_found" });
  });

  it("빈 문자열은 외부 조회 없이 not_found", async () => {
    const { client } = createFakeCompaniesClient(ALL_ROWS);
    const result = await resolveCompany("   ", { client });
    expect(result).toEqual({ type: "not_found" });
  });
});
