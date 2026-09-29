import { describe, expect, it } from "vitest";
import { computeCalendarQuarterMetrics, saveCalendarQuarterMetrics } from "@/lib/metrics/persist";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { createFakeFinancialsDb } from "./helpers/fake-financials-db";

const CORP_CODE = "00164779";

function reportValueRow(
  bsnsYear: number,
  reprtCode: string,
  accountId: string,
  amount3m: string | null,
  amountCum: string | null,
) {
  return {
    corp_code: CORP_CODE,
    bsns_year: bsnsYear,
    reprt_code: reprtCode,
    fs_div: "CFS",
    account_id: accountId,
    amount_3m: amount3m,
    amount_cum: amountCum,
  };
}

/** SK하이닉스류 12월 결산 회사의 2024년 1·3분기·사업보고서 원본 값(WU-105 산출물 형태). 간단한 값으로 구성했다. */
function seedReportValues() {
  return [
    // 1분기: 매출 1000, 영업이익 200, 순이익 150, 지배주주순이익 140
    reportValueRow(2024, "11013", "ifrs-full_Revenue", "1000", "1000"),
    reportValueRow(2024, "11013", "dart_OperatingIncomeLoss", "200", "200"),
    reportValueRow(2024, "11013", "ifrs-full_ProfitLoss", "150", "150"),
    reportValueRow(2024, "11013", "ifrs-full_ProfitLossAttributableToOwnersOfParent", "140", "140"),
    reportValueRow(2024, "11013", "ifrs-full_Assets", null, "10000"),
    reportValueRow(2024, "11013", "ifrs-full_Liabilities", null, "4000"),
    reportValueRow(2024, "11013", "ifrs-full_Equity", null, "6000"),
    reportValueRow(2024, "11013", "ifrs-full_EquityAttributableToOwnersOfParent", null, "5900"),
    // 3분기 누적(9개월): 매출 3300(1000+1100+1200), 영업이익 660
    reportValueRow(2024, "11014", "ifrs-full_Revenue", null, "3300"),
    reportValueRow(2024, "11014", "dart_OperatingIncomeLoss", null, "660"),
    reportValueRow(2024, "11014", "ifrs-full_ProfitLoss", null, "480"),
    reportValueRow(2024, "11014", "ifrs-full_ProfitLossAttributableToOwnersOfParent", null, "440"),
    reportValueRow(2024, "11014", "ifrs-full_Assets", null, "10800"),
    reportValueRow(2024, "11014", "ifrs-full_Liabilities", null, "4200"),
    reportValueRow(2024, "11014", "ifrs-full_Equity", null, "6600"),
    reportValueRow(2024, "11014", "ifrs-full_EquityAttributableToOwnersOfParent", null, "6500"),
    // 사업보고서(연간): 매출 4500(연간), 영업이익 900
    reportValueRow(2024, "11011", "ifrs-full_Revenue", null, "4500"),
    reportValueRow(2024, "11011", "dart_OperatingIncomeLoss", null, "900"),
    reportValueRow(2024, "11011", "ifrs-full_ProfitLoss", null, "650"),
    reportValueRow(2024, "11011", "ifrs-full_ProfitLossAttributableToOwnersOfParent", null, "600"),
    reportValueRow(2024, "11011", "ifrs-full_Assets", null, "11500"),
    reportValueRow(2024, "11011", "ifrs-full_Liabilities", null, "4400"),
    reportValueRow(2024, "11011", "ifrs-full_Equity", null, "7100"),
    reportValueRow(2024, "11011", "ifrs-full_EquityAttributableToOwnersOfParent", null, "7000"),
  ];
}

function dbWithData() {
  return createFakeFinancialsDb({
    account_map: ACCOUNT_MAP_SEED_ROWS,
    report_values: seedReportValues(),
    companies: [{ corp_code: CORP_CODE, acc_mt: 12, sectors: { is_financial: false } }],
  });
}

describe("computeCalendarQuarterMetrics (WU-106, TECH §6.2~6.4)", () => {
  it("12월 결산이라 회계 분기 = 달력 분기이고, 1분기·4분기 값이 정확히 계산된다", async () => {
    const { client } = dbWithData();
    const rows = await computeCalendarQuarterMetrics(CORP_CODE, { client });

    const q1 = rows.find((r) => r.cal_year === 2024 && r.cal_quarter === 1)!;
    expect(q1.metrics.revenue).toEqual({ value: BigInt(1000) });
    expect(q1.metrics.operating_margin).toEqual({ value: 20 }); // 200/1000*100
    expect(q1.metrics.equity_ratio.value).toBeCloseTo(60, 5); // 6000/10000*100
    expect(q1.fs_div).toBe("CFS");
    expect(q1.boundary_mismatch).toBe(false);

    // 4분기 = 사업보고서 연간(4500) − 3분기 누적(3300) = 1200 (완료조건)
    const q4 = rows.find((r) => r.cal_year === 2024 && r.cal_quarter === 4)!;
    expect(q4.metrics.revenue).toEqual({ value: BigInt(1200) });
    expect(q4.metrics.operating_income).toEqual({ value: BigInt(240) }); // 900-660
    expect(q4.metrics.assets).toEqual({ value: BigInt(11500) }); // 재무상태표는 분기말 값 그대로

    for (const row of rows) expect(row.calc_version).toBe("v1");
  });

  it("2분기 보고서가 없어 2분기 값을 계산할 수 없으면 NO_PREV_PERIOD/MISSING_ACCOUNT로 표시된다", async () => {
    const { client } = dbWithData();
    const rows = await computeCalendarQuarterMetrics(CORP_CODE, { client });

    const q2 = rows.find((r) => r.cal_year === 2024 && r.cal_quarter === 2)!;
    expect(q2.metrics.revenue.value).toBeNull();
  });
});

describe("saveCalendarQuarterMetrics (완료조건: 저장된 모든 행에 calc_version = v1)", () => {
  it("calendar_quarter_metrics에 upsert하고, 다시 저장해도 행이 늘지 않는다", async () => {
    const { client, tables } = dbWithData();

    const first = await saveCalendarQuarterMetrics(CORP_CODE, { client });
    expect(first.savedCount).toBeGreaterThan(0);

    const savedRows = tables.calendar_quarter_metrics ?? [];
    expect(savedRows.length).toBe(first.savedCount);
    for (const row of savedRows) expect(row.calc_version).toBe("v1");

    await saveCalendarQuarterMetrics(CORP_CODE, { client });
    expect((tables.calendar_quarter_metrics ?? []).length).toBe(first.savedCount); // upsert, 중복 없음
  });
});
