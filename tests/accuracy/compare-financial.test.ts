// WU-303 기업 비교·금융업 표시 = 손 계산 (ANSWER_KEY.md §8). 실제 엔진을 처음부터 끝까지 돌린다:
// OpenDART 원본 응답(tests/fixtures/dart/financials, 2024 사업보고서 연결) → 가짜 dartFetch → ensureReportValues
// → report_values → computeCalendarQuarterMetrics → runAnalysis(groupBy "company") → 결과 객체.
// 정답은 원문의 자산총계·부채총계·자본총계를 손으로 나눈 값이다 (엔진을 부르지 않고 구함).
import { describe, expect, it, vi } from "vitest";
import type { AnalysisRequestView, CompanyRef, ResultObject } from "@/contracts";
import { runAnalysis } from "@/lib/runner/execute";
import { FINANCIAL_FOOTNOTE } from "@/lib/runner/present";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { createFakeFinancialsDb } from "../unit/helpers/fake-financials-db";
import samsung from "../fixtures/dart/financials/00126380_samsung_2024_11011_CFS.json";
import skHynix from "../fixtures/dart/financials/00164779_sk_hynix_2024_11011_CFS.json";
import kb from "../fixtures/dart/financials/00688996_kb_financial_2024_11011_CFS.json";

const { dartFetchMock } = vi.hoisted(() => ({ dartFetchMock: vi.fn() }));
vi.mock("@/lib/dart/client", () => ({ dartFetch: dartFetchMock }));

const FIXTURES: Record<string, { list: { corp_code: string }[] }> = {
  "00126380": samsung,
  "00164779": skHynix,
  "00688996": kb,
};

// 2024 사업보고서(연결)만 있고 나머지 보고서는 013 — 비교 기준 분기는 2024Q4
dartFetchMock.mockImplementation(async (_path: string, params: Record<string, unknown>) => {
  const fixture = FIXTURES[String(params.corp_code)];
  if (
    fixture &&
    params.bsns_year === 2024 &&
    params.reprt_code === "11011" &&
    params.fs_div === "CFS"
  ) {
    return { status: "000", message: "정상", list: fixture.list };
  }
  return { status: "013", message: "조회된 데이타가 없습니다." };
});

function ref(corpCode: string, name: string, sector: string, isFinancial: boolean): CompanyRef {
  return {
    corpCode,
    stockCode: corpCode.slice(2),
    name,
    market: "KOSPI",
    sector: { name: sector, source: "manual", isFinancial },
    fiscalMonth: 12,
  };
}

const SK = ref("00164779", "SK하이닉스", "반도체", false);
const SAMSUNG = ref("00126380", "삼성전자", "반도체", false);
const KB = ref("00688996", "KB금융", "금융지주", true);

function request(peers: CompanyRef[]): AnalysisRequestView {
  return {
    intent: "compare",
    target: SK,
    peers,
    metrics: ["debt_ratio"],
    period: {
      from: "2024Q4",
      to: "2024Q4",
      specified: true,
      reason: "질문에 지정",
      clipped: false,
    },
    groupBy: "company",
    needsNews: false,
  };
}

async function compare(peers: CompanyRef[]): Promise<ResultObject> {
  const db = createFakeFinancialsDb({
    account_map: ACCOUNT_MAP_SEED_ROWS,
    companies: [SK, SAMSUNG, KB].map((c) => ({
      corp_code: c.corpCode,
      acc_mt: 12,
      sectors: { is_financial: c.sector.isFinancial },
    })),
  });
  const outcome = await runAnalysis(request(peers), {
    client: db.client,
    requireConfirmation: false,
  });
  if (outcome.kind !== "done") throw new Error("진단에서 멈춤");
  return outcome.result;
}

/** 표(사용된 데이터)의 한 칸 — 퍼센트 값 */
function cell(result: ResultObject, row: string, column: string): number | null {
  const found = result.usedData.preview.find((r) => r["기업"] === row);
  return (found?.[column] as number | null) ?? null;
}

// ANSWER_KEY §8.1 손 계산 (2024 사업보고서 연결, 원 단위 원문 값을 그대로 나눔)
const HAND = {
  SK하이닉스: { debt: 62.1512107900643, equity: 61.670831511378 }, // 45,939,505 / 73,915,704 · 73,915,704 / 119,855,209 (백만 원)
  삼성전자: { debt: 27.9318978119086, equity: 78.1665884039527 }, // 112,339,878 / 402,192,070 · 402,192,070 / 514,531,948
  KB금융: { debt: 1166.97858190883, equity: 7.89279325064359 }, // 698,030,351 / 59,815,181 · 59,815,181 / 757,845,532
};

describe("WU-303 금융사 포함 비교 (SK하이닉스 vs 삼성전자·KB금융, 2024Q4)", () => {
  it("비교표에 부채비율·자기자본비율이 모두 있고 값이 손 계산과 같다, KB금융·부채비율에 ※", async () => {
    const result = await compare([SAMSUNG, KB]);
    const columns = result.usedData.columns.map((c) => c.name);
    expect(columns).toEqual(["기업", "부채비율※", "자기자본비율"]);
    expect(result.usedData.preview.map((r) => r["기업"])).toEqual([
      "SK하이닉스",
      "삼성전자",
      "KB금융※",
    ]);

    expect(cell(result, "SK하이닉스", "부채비율※")).toBeCloseTo(HAND.SK하이닉스.debt, 8);
    expect(cell(result, "삼성전자", "부채비율※")).toBeCloseTo(HAND.삼성전자.debt, 8);
    expect(cell(result, "KB금융※", "부채비율※")).toBeCloseTo(HAND.KB금융.debt, 8);
    expect(cell(result, "SK하이닉스", "자기자본비율")).toBeCloseTo(HAND.SK하이닉스.equity, 8);
    expect(cell(result, "삼성전자", "자기자본비율")).toBeCloseTo(HAND.삼성전자.equity, 8);
    expect(cell(result, "KB금융※", "자기자본비율")).toBeCloseTo(HAND.KB금융.equity, 8);
  });

  it("표 아래 주석이 TECH §7 문구와 글자 그대로 같다", async () => {
    const result = await compare([SAMSUNG, KB]);
    const exact =
      "※ 금융회사는 고객 예금·보험계약 등이 부채로 잡히는 구조라 일반 기업보다 부채비율이 높게 나타날 수 있습니다.";
    expect(FINANCIAL_FOOTNOTE).toBe(exact);
    expect(result.usedData.notes).toContain(exact);
  });

  it("비교 그래프의 안정성 지표는 모든 기업 자기자본비율이다 (부채비율 없음)", async () => {
    const result = await compare([SAMSUNG, KB]);
    const keys = result.charts.flatMap((c) => c.series.map((s) => s.key));
    expect(keys).toEqual(["equity_ratio"]);
    const points = result.charts[0].series[0].points;
    expect(points.map((p) => p.x)).toEqual(["SK하이닉스", "삼성전자", "KB금융※"]);
    expect(result.figures[points[2].figureId].value).toBeCloseTo(HAND.KB금융.equity, 8);
  });

  it('"금융업 포함 — 공통 지표로 변환" 표시가 보인다', async () => {
    const result = await compare([SAMSUNG, KB]);
    expect(result.basis.flags).toContain("금융업 포함 — 공통 지표로 변환");
  });
});

describe("WU-303 금융사 없는 비교 (SK하이닉스 vs 삼성전자, 2024Q4)", () => {
  it("그래프는 부채비율이고 ※·§7 주석이 없다", async () => {
    const result = await compare([SAMSUNG]);
    const series = result.charts.flatMap((c) => c.series);
    expect(series.map((s) => s.key)).toEqual(["debt_ratio"]);
    expect(series[0].footnoteMark).toBeUndefined();
    expect(series[0].points.map((p) => p.x)).toEqual(["SK하이닉스", "삼성전자"]);
    expect(result.figures[series[0].points[1].figureId].value).toBeCloseTo(HAND.삼성전자.debt, 8);
    expect(result.charts.flatMap((c) => c.footnotes)).not.toContain(FINANCIAL_FOOTNOTE);
    expect(result.usedData.notes).not.toContain(FINANCIAL_FOOTNOTE);
    expect(result.usedData.columns.map((c) => c.name)).toEqual([
      "기업",
      "부채비율",
      "자기자본비율",
    ]);
    expect(result.basis.flags).not.toContain("금융업 포함 — 공통 지표로 변환");
  });
});
