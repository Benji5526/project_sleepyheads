// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisRequestView, CompanyRef } from "@/contracts";
import { DartApiError } from "@/lib/dart/errors";
import type { DartFinancialStatementItem } from "@/lib/financials/types";
import { UpstreamApiError } from "@/lib/quota/errors";
import type { ToolContext } from "@/lib/runner/tools/types";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { createFakeFinancialsDb } from "./helpers/fake-financials-db";

// 데이터 도구(src/lib/runner/tools/data-tools.ts)를 가짜 ctx·가짜 전자공시로 돌린다.
// - get_financials 사용량 = 캐시 적중을 뺀 실제 호출 수
// - 기업별 결측 "해당 분기 제외" → 비교 기준 분기가 한 기업 때문에 밀리지 않는다 ("기준 분기 다름")
// - 도구는 던지지 않고, 외부 API의 일시적 오류·시간 초과만 retryable
const { dartFetchMock, pickPeersMock } = vi.hoisted(() => ({
  dartFetchMock: vi.fn(),
  pickPeersMock: vi.fn(),
}));
vi.mock("@/lib/dart/client", () => ({ dartFetch: dartFetchMock }));
vi.mock("@/lib/sector/peers", () => ({ pickPeers: pickPeersMock }));

const { getFinancials, getPeers, buildResult } = await import("@/lib/runner/tools/data-tools");

function ref(corpCode: string, name: string): CompanyRef {
  return {
    corpCode,
    stockCode: corpCode.slice(2),
    name,
    market: "KOSPI",
    sector: { name: "반도체", source: "manual", isFinancial: false },
    fiscalMonth: 12,
  };
}
const A = ref("10000001", "가나전자");
const B = ref("10000002", "다라전자");

type Row = Pick<DartFinancialStatementItem, "sj_div" | "account_id" | "account_nm"> & {
  thstrm_amount: string;
  thstrm_add_amount?: string;
};

function statement(corpCode: string, rceptNo: string, reprtCode: string, rows: Row[]) {
  return rows.map((r) => ({
    rcept_no: rceptNo,
    reprt_code: reprtCode,
    bsns_year: "2024",
    corp_code: corpCode,
    sj_nm: "",
    account_detail: "-",
    thstrm_nm: "",
    thstrm_add_amount: r.thstrm_amount,
    frmtrm_nm: "",
    frmtrm_amount: "",
    bfefrmtrm_nm: "",
    bfefrmtrm_amount: "",
    ord: "",
    currency: "KRW",
    ...r,
  }));
}

/** 부채·자본·자산 (억 원 단위 숫자를 원으로) */
function balance(liabilities: number | null, equity: number, assets: number): Row[] {
  return [
    ...(liabilities === null
      ? []
      : [
          {
            sj_div: "BS",
            account_id: "ifrs-full_Liabilities",
            account_nm: "부채총계",
            thstrm_amount: String(liabilities * 1e8),
          },
        ]),
    {
      sj_div: "BS",
      account_id: "ifrs-full_Equity",
      account_nm: "자본총계",
      thstrm_amount: String(equity * 1e8),
    },
    {
      sj_div: "BS",
      account_id: "ifrs-full_Assets",
      account_nm: "자산총계",
      thstrm_amount: String(assets * 1e8),
    },
  ];
}

// 2024 반기(→ 2024Q2)·3분기(→ 2024Q3) 보고서만 있다. 다라전자 3분기보고서에는 부채총계가 없다(결측)
const REPORTS: Record<string, Row[]> = {
  "10000001|11012": balance(50, 100, 150),
  "10000001|11014": balance(60, 100, 160),
  "10000002|11012": balance(30, 100, 130),
  "10000002|11014": balance(null, 100, 140),
};

function mockDart() {
  dartFetchMock.mockImplementation(async (path: string, params: Record<string, unknown>) => {
    if (path === "list.json") return { status: "013", message: "없음" };
    const rows = REPORTS[`${params.corp_code}|${params.reprt_code}`];
    if (params.bsns_year !== 2024 || params.fs_div !== "CFS" || !rows) {
      return { status: "013", message: "없음" };
    }
    const rcept = `2024${params.reprt_code}${String(params.corp_code).slice(-2)}`;
    return {
      status: "000",
      message: "정상",
      list: statement(String(params.corp_code), rcept, String(params.reprt_code), rows),
    };
  });
}

function db() {
  return createFakeFinancialsDb({
    account_map: ACCOUNT_MAP_SEED_ROWS,
    issue_rules: [],
    companies: [A, B].map((c) => ({
      corp_code: c.corpCode,
      acc_mt: 12,
      sectors: { is_financial: false },
    })),
  });
}

function request(): AnalysisRequestView {
  return {
    intent: "compare",
    target: A,
    peers: [B],
    metrics: ["debt_ratio"],
    period: { from: "2024Q2", to: "2024Q3", specified: true, reason: "지정", clipped: false },
    groupBy: "company",
    needsNews: false,
  };
}

function ctx(client: ToolContext["client"], extra: Partial<ToolContext> = {}): ToolContext {
  return {
    request: request(),
    question: "가나전자와 다라전자 부채비율 비교",
    mixedScope: false,
    analysisId: "a1",
    userId: null,
    client,
    decisions: null,
    previous: [],
    ...extra,
  };
}

beforeEach(() => {
  dartFetchMock.mockReset();
  pickPeersMock.mockReset();
  mockDart();
});

describe("get_financials 사용량", () => {
  it("처음에는 실제 보고서 호출 수를, 다음엔 공시 확인 1건(정정 확인)만, 그다음은 0을 센다", async () => {
    const fake = db();
    const input = { companies: [A], from: "2024Q2" as const, to: "2024Q3" as const };
    const paths = () => dartFetchMock.mock.calls.map((c) => c[0]);

    // 처음 조회하는 기업: 받아 둔 보고서가 없어 공시 목록은 건너뛰고 재무제표만 (캐시 적중 없음)
    const first = await getFinancials(input, ctx(fake.client));
    if (first.status !== "succeeded") throw new Error(first.status);
    expect(paths()).not.toContain("list.json");
    expect(first.usage.externalCalls).toBe(dartFetchMock.mock.calls.length);
    expect(first.usage.externalCalls).toBeGreaterThan(0);
    expect(first.outputSummary).toContain(`외부 호출 ${first.usage.externalCalls}건`);

    // 받아 둔 보고서가 생겼으니 공시 목록으로 정정을 확인한다 (보고서는 캐시)
    dartFetchMock.mockClear();
    const second = await getFinancials(input, ctx(fake.client));
    expect(paths()).toEqual(["list.json"]);
    expect(second).toMatchObject({ status: "succeeded", usage: { externalCalls: 1 } });

    // 24시간 안: 외부 호출 0
    dartFetchMock.mockClear();
    const third = await getFinancials(input, ctx(fake.client));
    expect(dartFetchMock).not.toHaveBeenCalled();
    expect(third).toMatchObject({ status: "succeeded", usage: { externalCalls: 0 } });
  });

  it("외부 API의 일시적 오류·시간 초과는 재시도 대상, 키 오류·한도 초과는 아니다 (던지지 않는다)", async () => {
    const input = { companies: [A], from: "2024Q2" as const, to: "2024Q3" as const };
    dartFetchMock.mockImplementation(async (path: string) => {
      if (path === "list.json") return { status: "013", message: "없음" };
      throw new UpstreamApiError("dart", "OpenDART 요청 실패(네트워크·시간 초과)", true);
    });
    await expect(getFinancials(input, ctx(db().client))).resolves.toMatchObject({
      status: "failed",
      retryable: true,
    });

    dartFetchMock.mockImplementation(async (path: string) => {
      if (path === "list.json") return { status: "013", message: "없음" };
      throw new DartApiError("020");
    });
    await expect(getFinancials(input, ctx(db().client))).resolves.toMatchObject({
      status: "failed",
      retryable: false,
    });
  });
});

describe("get_peers 도구", () => {
  it("고른 경쟁사와 순서 기준을 실행 기록 요약에 남긴다", async () => {
    pickPeersMock.mockResolvedValue({
      peers: [B],
      candidateCount: 4,
      order: "시가총액 순 (2026-09-29 종가)",
      externalCalls: 2,
    });
    const outcome = await getPeers({ target: A, count: 3 }, ctx(db().client));
    expect(outcome).toMatchObject({
      status: "succeeded",
      output: { peers: [B] },
      inputSummary: "가나전자 (반도체), 최대 3곳",
      outputSummary: "다라전자 — 시가총액 순 (2026-09-29 종가), 같은 섹터 후보 4곳",
      usage: { externalCalls: 2, llmCostUsd: 0 },
    });
  });

  it("고를 수 없으면 재시도 없는 실패", async () => {
    pickPeersMock.mockRejectedValue(new Error("섹터가 '기타'라 고를 수 없습니다"));
    await expect(getPeers({ target: A, count: 3 }, ctx(db().client))).resolves.toMatchObject({
      status: "failed",
      retryable: false,
    });
  });
});

describe("build_result — 기업별 결측 제외 (Phase 1 후속 ①)", () => {
  it("다라전자만 2024Q3를 빼고 2024Q2로 비교한다 — 가나전자는 2024Q3 그대로", async () => {
    const fake = db();
    const outcome = await buildResult(
      {},
      ctx(fake.client, { decisions: { missing_account: "exclude_quarter" } }),
    );
    expect(outcome.status).toBe("succeeded");
    if (outcome.status !== "succeeded") return;
    const { result } = outcome.output;

    const debt = result.charts[0].series.find((s) => s.key === "debt_ratio")!;
    const labels = debt.points.map((p) => result.figures[p.figureId].label);
    expect(labels).toEqual(["가나전자 부채비율 2024Q3", "다라전자 부채비율 2024Q2"]);
    expect(result.figures[debt.points[0].figureId].value).toBeCloseTo(60, 9); // 60 ÷ 100
    expect(result.figures[debt.points[1].figureId].value).toBeCloseTo(30, 9); // 30 ÷ 100

    expect(result.basis.flags).toContain("기준 분기 다름 — 가나전자 2024Q3, 다라전자 2024Q2");
    expect(result.basis.flags).toContain("계정 값이 빈 분기 제외: 다라전자 2024Q3");
  });

  it("결측을 빈칸으로 두면 같은 분기(2024Q3)로 비교하고, 계산 불가 사유가 결과 주석에 보인다", async () => {
    const outcome = await buildResult(
      {},
      ctx(db().client, { decisions: { missing_account: "show_blank" } }),
    );
    if (outcome.status !== "succeeded") throw new Error(outcome.status);
    const { result } = outcome.output;
    expect(result.basis.flags.some((f) => f.startsWith("기준 분기 다름"))).toBe(false);
    expect(result.usedData.notes).toContain(
      "계산 불가 (공시에 계정 값 없음): 다라전자 부채비율 2024Q3",
    );
  });
});
