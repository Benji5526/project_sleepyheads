// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AnalysisRequestView, CompanyRef, ResultObject } from "@/contracts";
import { applyBoardFilters } from "@/lib/boards/filters";
import { runAnalysis } from "@/lib/runner/execute";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { createFakeFinancialsDb } from "../unit/helpers/fake-financials-db";

// WU-401 보드 다시 계산의 데이터 버전 규칙 (WU-202): 원래 버전의 출처(접수번호)는 그대로, 새 기간·기업만 새로.
// 손으로 미리 계산한 값과 비교한다 (preprocess-versions.test.ts와 같은 샘플을 줄여 씀, 12월 결산, 단위 원).
//
// 원래 분석(2024Q1~2024Q3)은 3분기보고서 정정본 C1을 썼다. 그 뒤 2차 정정 C2와 사업보고서 D1이 수집됐다.
// | 보고서          | 매출(3개월 / 누적) | 영업이익(3개월 / 누적) |
// |-----------------|--------------------|------------------------|
// | 1분기 A1        | 1,000 / 1,000      | 200 / 200              |
// | 반기 B1         | 1,100 / 2,100      | (없음)                 |
// | 3분기 C1(원래)  | 1,250 / 3,350      | 300 / 780              |
// | 3분기 C2(새)    | 1,300 / 3,400      | 310 / 790              |
// | 사업 D1(새)     |   — / 4,900        |  — / 1,150             |
//
// 보드 기간을 2024Q2~2024Q4로 바꾸면:
// - 2024Q3은 원래 출처 C1 그대로 → 매출 1,250 (C2의 1,300이 아님)
// - 2024Q4 = 사업보고서 누적 − 3분기 누적(원래 출처 C1) → 매출 4,900 − 3,350 = 1,550, 영업이익 1,150 − 780 = 370
//   (C2로 계산했다면 1,500 · 360)
// 비교 기업(비교전자, 3분기보고서만 있음: 매출 500 / 1,500)을 넣으면 기업 비교 막대가 더해진다:
// - 샘플전자는 보고서가 있는 가장 최근 분기 2024Q4 → 1,550, 비교전자는 2024Q3 → 500 ("기준 분기 다름")

const CORP = "00999999";
const PEER_CORP = "00888888";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A1 = "20240514000100";
const B1 = "20240814000200";
const C1 = "20241120000400";
const C2 = "20250105000500";
const D1 = "20250310000600";
const P1 = "20241114000700";

const REVENUE = "ifrs-full_Revenue";
const OP = "dart_OperatingIncomeLoss";

const company: CompanyRef = {
  corpCode: CORP,
  stockCode: "999999",
  name: "샘플전자",
  market: "KOSPI",
  sector: { name: "반도체", source: "manual", isFinancial: false },
  fiscalMonth: 12,
};
const peer: CompanyRef = { ...company, corpCode: PEER_CORP, stockCode: "888888", name: "비교전자" };

const request: AnalysisRequestView = {
  intent: "trend",
  target: company,
  peers: [],
  metrics: ["revenue", "operating_income"],
  period: {
    from: "2024Q1",
    to: "2024Q3",
    specified: true,
    reason: "질문에 기간 있음",
    clipped: false,
  },
  groupBy: "quarter",
  needsNews: false,
};

function value(
  corpCode: string,
  reprtCode: string,
  rceptNo: string,
  accountId: string,
  amount3m: string | null,
  amountCum: string,
) {
  return {
    id: `${rceptNo}-${accountId}`,
    corp_code: corpCode,
    bsns_year: 2024,
    reprt_code: reprtCode,
    fs_div: "CFS",
    account_id: accountId,
    amount_3m: amount3m,
    amount_cum: amountCum,
    source_rcept_no: rceptNo,
    superseded_by: null as string | null,
  };
}

function fetchState(corpCode: string, bsnsYear: number, reprtCode: string, rceptNo: string | null) {
  return {
    corp_code: corpCode,
    bsns_year: bsnsYear,
    reprt_code: reprtCode,
    fs_div_used: rceptNo ? "CFS" : null,
    rcept_no: rceptNo,
    checked_at: new Date().toISOString(),
  };
}

const NONE_2023 = ["11013", "11012", "11014", "11011"];

function sampleDb() {
  return createFakeFinancialsDb({
    account_map: ACCOUNT_MAP_SEED_ROWS,
    companies: [
      { corp_code: CORP, acc_mt: 12, sectors: { is_financial: false } },
      { corp_code: PEER_CORP, acc_mt: 12, sectors: { is_financial: false } },
    ],
    report_values: [
      value(CORP, "11013", A1, REVENUE, "1000", "1000"),
      value(CORP, "11013", A1, OP, "200", "200"),
      value(CORP, "11012", B1, REVENUE, "1100", "2100"),
      value(CORP, "11014", C1, REVENUE, "1250", "3350"),
      value(CORP, "11014", C1, OP, "300", "780"),
      value(PEER_CORP, "11014", P1, REVENUE, "500", "1500"),
      value(PEER_CORP, "11014", P1, OP, "50", "150"),
    ],
    // 증감률용 앞 분기(2023년)와 아직 안 나온 보고서는 없다(013)고 이미 확인해 둔 상태 — 외부 호출 없음
    report_fetch_state: [
      ...NONE_2023.map((r) => fetchState(CORP, 2023, r, null)),
      fetchState(CORP, 2024, "11013", A1),
      fetchState(CORP, 2024, "11012", B1),
      fetchState(CORP, 2024, "11014", C1),
      fetchState(CORP, 2024, "11011", null),
      ...NONE_2023.map((r) => fetchState(PEER_CORP, 2023, r, null)),
      fetchState(PEER_CORP, 2024, "11013", null),
      fetchState(PEER_CORP, 2024, "11012", null),
      fetchState(PEER_CORP, 2024, "11014", P1),
      fetchState(PEER_CORP, 2024, "11011", null),
    ],
  });
}

/** 원래 분석 뒤에 C2(3분기 2차 정정)·D1(사업보고서)이 수집됐다 */
function collectNewReports(tables: ReturnType<typeof sampleDb>["tables"]) {
  for (const row of tables.report_values) {
    if (row.source_rcept_no === C1) row.superseded_by = `${C2}-${row.account_id}`;
  }
  tables.report_values.push(
    value(CORP, "11014", C2, REVENUE, "1300", "3400"),
    value(CORP, "11014", C2, OP, "310", "790"),
    value(CORP, "11011", D1, REVENUE, null, "4900"),
    value(CORP, "11011", D1, OP, null, "1150"),
  );
  for (const state of tables.report_fetch_state) {
    if (state.corp_code !== CORP || state.bsns_year !== 2024) continue;
    if (state.reprt_code === "11014") state.rcept_no = C2;
    if (state.reprt_code === "11011") {
      state.rcept_no = D1;
      state.fs_div_used = "CFS";
    }
  }
}

function points(result: ResultObject, key: string, chartId = "c1"): [string, number | null][] {
  const chart = result.charts.find((c) => c.id === chartId)!;
  const series = chart.series.find((s) => s.key === key)!;
  return series.points.map((p) => [p.x, result.figures[p.figureId].value]);
}

async function originalRun(client: ReturnType<typeof sampleDb>["client"]) {
  const done = await runAnalysis(request, {
    client,
    userId: USER,
    requireConfirmation: true,
    decisions: { missing_account: "show_blank", duplicate_correction: "latest_correction" },
  });
  if (done.kind !== "done") throw new Error("선택이 있으니 끝까지 계산해야 한다");
  return done;
}

describe("보드 다시 계산 — 원래 출처는 그대로, 새 기간만 새로 (WU-401·WU-202)", () => {
  it("기간을 늘리면 겹치는 분기는 원래 접수번호(C1) 값, 새 분기만 새 보고서로 계산한다", async () => {
    const { client, tables } = sampleDb();
    const original = await originalRun(client);
    collectNewReports(tables);

    const boardRequest = applyBoardFilters(
      request,
      { period: { from: "2024Q2", to: "2024Q4" } },
      [],
    );
    const board = await runAnalysis(boardRequest, {
      client,
      userId: USER,
      base: original.version,
      peerComparisonChart: true,
    });
    if (board.kind !== "done") throw new Error("보드 다시 계산은 진단에서 멈추지 않는다");

    expect(points(board.result, "revenue")).toEqual([
      ["2024Q2", 1100],
      ["2024Q3", 1250],
      ["2024Q4", 1550],
    ]);
    expect(points(board.result, "operating_income")).toEqual([
      ["2024Q2", null],
      ["2024Q3", 300],
      ["2024Q4", 370],
    ]);
    // 원래 선택(빈칸 표시)을 이어 쓴다 — 결측 분기를 빼지 않았다
    expect(board.version.decisions.missing_account).toBe("show_blank");
    // 데이터 버전: 3분기는 원래 C1, 사업보고서는 새로 받은 D1
    const source = (reprtCode: string) =>
      board.version.sources.find((s) => s.bsnsYear === 2024 && s.reprtCode === reprtCode);
    expect(source("11014")?.rceptNo).toBe(C1);
    expect(source("11011")?.rceptNo).toBe(D1);
    expect(board.result.basis.period).toMatchObject({ from: "2024Q2", to: "2024Q4" });
    // 비교 기업이 없으면 비교 막대를 더하지 않는다
    expect(board.result.charts.map((c) => c.type)).toEqual(["line"]);

    // 대조: 원래 버전 없이 최신으로 계산하면 2차 정정본(C2) 값이 나온다 — 위 숫자가 규칙 덕분임을 확인
    const fresh = await runAnalysis(boardRequest, {
      client,
      userId: USER,
      decisions: original.version.decisions,
    });
    if (fresh.kind !== "done") throw new Error("끝까지 계산해야 한다");
    expect(points(fresh.result, "revenue").slice(1)).toEqual([
      ["2024Q3", 1300],
      ["2024Q4", 1500],
    ]);
  });

  it("비교 기업을 넣으면 분기별 차트는 대상 그대로 두고 기업 비교 막대를 더한다", async () => {
    const { client, tables } = sampleDb();
    const original = await originalRun(client);
    collectNewReports(tables);

    const boardRequest = applyBoardFilters(
      request,
      { period: { from: "2024Q2", to: "2024Q4" }, peers: [peer.stockCode] },
      [peer],
    );
    const board = await runAnalysis(boardRequest, {
      client,
      userId: USER,
      base: original.version,
      peerComparisonChart: true,
    });
    if (board.kind !== "done") throw new Error("보드 다시 계산은 진단에서 멈추지 않는다");

    expect(board.result.charts.map((c) => [c.id, c.type])).toEqual([
      ["c1", "line"],
      ["c2", "bar"],
    ]);
    expect(points(board.result, "revenue")[2]).toEqual(["2024Q4", 1550]);
    expect(points(board.result, "revenue", "c2")).toEqual([
      ["샘플전자", 1550],
      ["비교전자", 500],
    ]);
    expect(board.result.charts[1].title).toContain("기업별 비교");
    expect(board.result.basis.flags).toContain("기준 분기 다름 — 샘플전자 2024Q4, 비교전자 2024Q3");
    // 같은 그림의 숫자 ID가 겹치지 않는다
    const ids = board.result.charts.flatMap((c) =>
      c.series.flatMap((s) => s.points.map((p) => p.figureId)),
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("비교 기업을 넣지 않은 일반 분석(peerComparisonChart 없음)은 예전 결과 그대로다", async () => {
    const { client } = sampleDb();
    const withPeer = { ...request, peers: [peer] };
    const done = await runAnalysis(withPeer, {
      client,
      userId: USER,
      requireConfirmation: true,
      decisions: { missing_account: "show_blank", duplicate_correction: "latest_correction" },
    });
    if (done.kind !== "done") throw new Error("끝까지 계산해야 한다");
    expect(done.result.charts.map((c) => c.type)).toEqual(["line"]);
  });
});
