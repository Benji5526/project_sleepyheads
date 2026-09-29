import { describe, expect, it } from "vitest";
import { classifySector } from "@/lib/companies/classify-sector";
import { createFakeTablesClient } from "./helpers/fake-tables";

const SECTORS = [
  { id: "sec-semi", name: "반도체", is_financial: false },
  { id: "sec-bank", name: "은행", is_financial: true },
  { id: "sec-ship", name: "조선", is_financial: false },
  { id: "sec-other", name: "기타", is_financial: false },
];

const SECTOR_RULES = [
  { induty_prefix: "261", sector_id: "sec-semi" },
  { induty_prefix: "64", sector_id: "sec-bank" },
  { induty_prefix: "3", sector_id: "sec-bank" }, // 겹치는 접두어 테스트용(의미상 조선과 무관, 우선순위만 확인)
  { induty_prefix: "311", sector_id: "sec-ship" },
];

const SECTOR_OVERRIDES = [{ corp_code: "00164779", sector_id: "sec-semi" }];

function client() {
  return createFakeTablesClient({
    sectors: SECTORS,
    sector_rules: SECTOR_RULES,
    sector_overrides: SECTOR_OVERRIDES,
  }).client;
}

describe("classifySector (WU-104, TECH §8)", () => {
  it("수동 지정이 있으면 업종코드와 무관하게 그것을 쓴다(manual)", async () => {
    const result = await classifySector(client(), "00164779", "999999");
    expect(result).toEqual({ sectorId: "sec-semi", sectorSource: "manual" });
  });

  it("수동 지정이 없으면 업종코드 규칙으로 분류한다(induty_code)", async () => {
    const result = await classifySector(client(), "00126380", "2612");
    expect(result).toEqual({ sectorId: "sec-semi", sectorSource: "induty_code" });
  });

  it("여러 규칙이 걸리면 가장 긴 접두어를 쓴다", async () => {
    const result = await classifySector(client(), "00000001", "3113000");
    expect(result).toEqual({ sectorId: "sec-ship", sectorSource: "induty_code" });
  });

  it("어느 규칙에도 안 맞으면 기타로 분류한다(other)", async () => {
    const result = await classifySector(client(), "00000002", "999000");
    expect(result).toEqual({ sectorId: "sec-other", sectorSource: "other" });
  });

  it("업종코드가 없으면(null) 규칙을 건너뛰고 기타로 분류한다", async () => {
    const result = await classifySector(client(), "00000003", null);
    expect(result).toEqual({ sectorId: "sec-other", sectorSource: "other" });
  });
});
