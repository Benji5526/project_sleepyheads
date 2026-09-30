// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import type { AnalysisRequestView, CompanyRef, Quarter } from "@/contracts";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { createFakeFinancialsDb } from "./helpers/fake-financials-db";

// WU-303 비교 계산 보조 규칙 + Phase 1 후속 ② 최신 데이터 재분석 기간
const { dartFetchMock } = vi.hoisted(() => ({ dartFetchMock: vi.fn() }));
vi.mock("@/lib/dart/client", () => ({ dartFetch: dartFetchMock }));

const { ensureCompanyFinancials } = await import("@/lib/runner/company-financials");
const { createFigureAllocator } = await import("@/lib/runner/figures");
const { buildCompanyComparisonSeries } = await import("@/lib/runner/series-builders");
const { comparisonFlags, unavailableFlags } = await import("@/lib/runner/present");
const { withLatestDefaultPeriod } = await import("@/lib/runner/latest-request");

const BANK: CompanyRef = {
  corpCode: "20000001",
  stockCode: "200001",
  name: "가상금융",
  market: "KOSPI",
  sector: { name: "금융지주", source: "manual", isFinancial: true },
  fiscalMonth: 12,
};

describe("금융사 영업이익률 = 영업이익 ÷ 영업수익 (TECH §7)", () => {
  it("원문에 영업수익 행이 있으면 매출 자리에 영업수익을 쓰고 영업이익률을 그것으로 계산한다", async () => {
    // 3분기보고서(2024Q3, 3개월 값): 영업수익 10조, 영업이익 1.5조 — 표준 계정 코드 없이 이름만 있는 형태
    dartFetchMock.mockImplementation(async (_path: string, params: Record<string, unknown>) => {
      if (params.bsns_year !== 2024 || params.reprt_code !== "11014" || params.fs_div !== "CFS") {
        return { status: "013", message: "없음" };
      }
      const item = (sj: string, id: string, nm: string, amount: string) => ({
        rcept_no: "20241114000001",
        reprt_code: "11014",
        bsns_year: "2024",
        corp_code: BANK.corpCode,
        sj_div: sj,
        sj_nm: "",
        account_id: id,
        account_nm: nm,
        account_detail: "-",
        thstrm_nm: "",
        thstrm_amount: amount,
        thstrm_add_amount: amount,
        frmtrm_nm: "",
        frmtrm_amount: "",
        bfefrmtrm_nm: "",
        bfefrmtrm_amount: "",
        ord: "",
        currency: "KRW",
      });
      return {
        status: "000",
        message: "정상",
        list: [
          item("CIS", "-표준계정코드 미사용-", "영업수익", "10000000000000"),
          item("CIS", "ifrs-full_ProfitLossFromOperatingActivities", "영업이익", "1500000000000"),
        ],
      };
    });
    const db = createFakeFinancialsDb({
      account_map: ACCOUNT_MAP_SEED_ROWS,
      companies: [{ corp_code: BANK.corpCode, acc_mt: 12, sectors: { is_financial: true } }],
    });
    const financials = await ensureCompanyFinancials(BANK, "2024Q3", "2024Q3", {
      client: db.client,
    });

    const allocator = createFigureAllocator();
    const { series } = buildCompanyComparisonSeries(
      [{ company: BANK, financials, fsDiv: "CFS" }],
      "2024Q3",
      ["revenue", "operating_margin"],
      allocator,
    );
    const [revenue, margin] = series.map((s) => allocator.figures[s.points[0].figureId]);
    expect(revenue).toMatchObject({ label: "가상금융 매출(영업수익) 2024Q3", value: 10e12 });
    expect(margin.label).toBe("가상금융 영업이익률(영업이익÷영업수익) 2024Q3");
    expect(margin.value).toBeCloseTo(15, 12); // 1.5조 ÷ 10조 × 100
  });
});

describe("비교 기준 분기 표시", () => {
  const sample = (name: string) =>
    ({ company: { ...BANK, corpCode: name, name }, financials: {}, fsDiv: "CFS" }) as never;

  it("기업마다 다르면 '기준 분기 다름 — …'", () => {
    const flags = comparisonFlags(
      [sample("가"), sample("나")],
      new Map<string, Quarter>([
        ["가", "2026Q2"],
        ["나", "2026Q1"],
      ]),
      "2026Q2",
    );
    expect(flags).toEqual(["기준 분기 다름 — 가 2026Q2, 나 2026Q1"]);
  });

  it("모두 같지만 요청한 마지막 분기가 아니면 그 사실을 알린다 (보고서 제출 전)", () => {
    const flags = comparisonFlags(
      [sample("가"), sample("나")],
      new Map<string, Quarter>([
        ["가", "2026Q2"],
        ["나", "2026Q2"],
      ]),
      "2026Q3",
    );
    expect(flags).toEqual(["비교 기준 분기 2026Q2 — 2026Q3 보고서가 아직 없습니다"]);
  });
});

describe("비교 기준 분기 표시 — 제외한 분기", () => {
  it("마지막 분기를 모든 기업이 결측으로 뺐으면 '보고서 없음'이 아니라 제외했다고 적는다", () => {
    const sample = (name: string) =>
      ({ company: { ...BANK, corpCode: name, name }, financials: {}, fsDiv: "CFS" }) as never;
    const flags = comparisonFlags(
      [sample("가"), sample("나")],
      new Map<string, Quarter>([
        ["가", "2026Q1"],
        ["나", "2026Q1"],
      ]),
      "2026Q2",
      new Map([
        ["가", new Set<Quarter>(["2026Q2"])],
        ["나", new Set<Quarter>(["2026Q2"])],
      ]),
    );
    expect(flags).toEqual(["비교 기준 분기 2026Q1 — 2026Q2는 계정 값이 비어 제외했습니다"]);
  });
});

describe("계산 불가 사유 (TECH §6.4, WU-302 계산 부분)", () => {
  it("직전 분기 없음·분모 0 사유를 한 줄씩 적는다 (부호 전환 글자는 계산 불가가 아니다)", () => {
    const f = (id: string, label: string, reason?: "NO_PREV_PERIOD" | "ZERO_DENOMINATOR") => ({
      id,
      label,
      value: null,
      unit: "PERCENT" as const,
      display: reason ? "계산 불가" : "흑자전환",
      basis: { report: "", fsDiv: "CFS" as const },
      ...(reason ? { reason } : {}),
    });
    const flags = unavailableFlags({
      f1: f("f1", "영업이익 QoQ 증감률 2025Q3", "NO_PREV_PERIOD"),
      f2: f("f2", "영업이익률 2025Q4", "ZERO_DENOMINATOR"),
      f3: f("f3", "영업이익 YoY 증감률 2026Q1"),
    });
    expect(flags).toEqual([
      "계산 불가 (비교할 직전 기간 없음): 영업이익 QoQ 증감률 2025Q3",
      "계산 불가 (기준 값이 0): 영업이익률 2025Q4",
    ]);
  });
});

describe("최신 데이터로 다시 분석 — 기간 (Phase 1 후속 ②)", () => {
  const base: AnalysisRequestView = {
    intent: "recent",
    target: BANK,
    peers: [],
    metrics: ["operating_income"],
    period: {
      from: "2025Q3",
      to: "2026Q2",
      specified: false,
      reason: "기간 미지정 → 최근 4개 분기",
      clipped: false,
    },
    groupBy: "quarter",
    needsNews: false,
  };
  // 2026-11-20 KST → 최근 완료 분기 2026Q3
  const later = new Date("2026-11-20T03:00:00Z");

  it("질문에 기간이 없었으면 AI 없이 오늘 기준 최근 N분기로 다시 잡는다", () => {
    const refreshed = withLatestDefaultPeriod(base, later);
    expect(refreshed.period).toMatchObject({ from: "2025Q4", to: "2026Q3", specified: false });
    expect(refreshed.metrics).toEqual(base.metrics);
  });

  it("질문에 기간이 있었으면 그대로", () => {
    const specified = { ...base, period: { ...base.period, specified: true } };
    expect(withLatestDefaultPeriod(specified, later)).toBe(specified);
  });

  it("연도별은 다 끝난 연도까지 (진행 중인 올해 제외)", () => {
    const annual = { ...base, intent: "annual" as const, groupBy: "year" as const };
    expect(withLatestDefaultPeriod(annual, later).period).toMatchObject({
      from: "2023Q1",
      to: "2025Q4",
    });
  });
});
