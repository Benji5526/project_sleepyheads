import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CompanyRow } from "@/lib/companies/row";
import { createFakeCompaniesClient } from "./helpers/fake-companies-table";

// 기업 목록 동기화(WU-103)는 이름·코드만 넣는다. 개황이 빈 기업은 처음 확정할 때 채워야
// "삼성전자는 조회 가능한 상장사 목록에 없습니다"가 나오지 않는다 (TECH §3.1, WU-104).

const rows: CompanyRow[] = [];
const profiled: string[] = [];

vi.mock("@/lib/companies/profile", () => ({
  ensureCompanyProfile: async (corpCode: string) => {
    profiled.push(corpCode);
    const row = rows.find((r) => r.corp_code === corpCode);
    if (!row) throw new Error("없는 기업");
    if (corpCode === "99999999") throw new Error("DART 오류");
    Object.assign(row, {
      market: row.corp_code === "00000001" ? null : "KOSPI", // 00000001은 코넥스
      acc_mt: 12,
      sector_source: "induty_code",
      sectors: { name: "반도체", is_financial: false },
    });
    return { corpCode, fromCache: false };
  },
}));

const { resolveCompany } = await import("@/lib/companies/resolve");

function bare(corpCode: string, stockCode: string, name: string): CompanyRow {
  return {
    corp_code: corpCode,
    stock_code: stockCode,
    corp_name: name,
    market: null,
    acc_mt: null,
    sector_source: null,
    sectors: null,
  };
}

beforeEach(() => {
  rows.length = 0;
  profiled.length = 0;
});

describe("resolveCompany — 개황이 빈 기업은 처음 조회 때 채운다", () => {
  it("이름으로 정확히 찾은 기업의 개황을 채워 확정한다", async () => {
    rows.push(bare("00126380", "005930", "삼성전자"));
    const { client } = createFakeCompaniesClient(rows);
    const result = await resolveCompany("삼성전자", { client });
    expect(profiled).toEqual(["00126380"]);
    expect(result).toMatchObject({
      type: "resolved",
      company: { name: "삼성전자", market: "KOSPI", fiscalMonth: 12 },
    });
  });

  it("종목코드로 찾을 때도 채운다", async () => {
    rows.push(bare("00126380", "005930", "삼성전자"));
    const { client } = createFakeCompaniesClient(rows);
    const result = await resolveCompany("005930", { client });
    expect(result.type).toBe("resolved");
  });

  it("개황이 이미 있으면 전자공시를 부르지 않는다", async () => {
    rows.push({
      ...bare("00126380", "005930", "삼성전자"),
      market: "KOSPI",
      acc_mt: 12,
      sector_source: "induty_code",
      sectors: { name: "반도체", is_financial: false },
    });
    const { client } = createFakeCompaniesClient(rows);
    await resolveCompany("삼성전자", { client });
    expect(profiled).toEqual([]);
  });

  it("코스피·코스닥이 아니거나 조회에 실패한 기업은 후보에서 빠진다", async () => {
    rows.push(
      bare("00000001", "000001", "삼성테스트코넥스"),
      bare("99999999", "999999", "삼성실패"),
      bare("00126380", "005930", "삼성전자"),
    );
    const { client } = createFakeCompaniesClient(rows);
    const result = await resolveCompany("삼성", { client });
    expect(result).toMatchObject({ type: "resolved", company: { name: "삼성전자" } });
  });
});
