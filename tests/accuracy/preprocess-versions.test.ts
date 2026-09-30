// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { AnalysisRequestView, CompanyRef, ResultObject } from "@/contracts";
import { toDecisions } from "@/lib/preprocess/decisions";
import { runAnalysis } from "@/lib/runner/execute";
import { sameNumbers } from "@/lib/versions/compare";
import { isNewerDataAvailable } from "@/lib/versions/store";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { createFakeFinancialsDb } from "../unit/helpers/fake-financials-db";

// WU-202·WU-203 정확도: 결측·정정 중복을 일부러 넣은 고정 샘플로 진단 카드의 처리 전후 행 수·합계,
// 선택 적용 결과, 같은 데이터 버전 재실행의 재현성을 **손으로 미리 계산한 값**과 비교한다.
//
// 샘플 (12월 결산, 2024Q1~2024Q3, 매출·영업이익, 단위 원)
// | 분기   | 보고서            | 매출            | 영업이익          |
// |--------|-------------------|-----------------|-------------------|
// | 2024Q1 | 1분기 A1          | 1,000           | 200               |
// | 2024Q2 | 반기 B1           | 1,100           | (없음 = 결측)      |
// | 2024Q3 | 3분기 C0(최초)    | 1,200           | 280               |
// |        | 3분기 C1(정정)    | 1,250           | 300               |
//
// 손 계산 (행 = 분기, 합계 = 매출)
// - 결측: 영향 1행(2024Q2). 처리 전 3행·3,350 / 해당 분기 제외 2행·2,250 / 빈칸 표시 3행·3,350
// - 정정 중복: 영향 1행(2024Q3). 처리 전 4행(두 공시 모두)·4,550(=3,350+1,200)
//   / 최신 정정본 3행·3,350 / 최초 공시 3행·3,300

const CORP = "00999999";
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const A1 = "20240514000100";
const B1 = "20240814000200";
const C0 = "20241114000300";
const C1 = "20241120000400";
const C2 = "20250105000500";

const company: CompanyRef = {
  corpCode: CORP,
  stockCode: "999999",
  name: "샘플전자",
  market: "KOSPI",
  sector: { name: "반도체", source: "manual", isFinancial: false },
  fiscalMonth: 12,
};

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
  reprtCode: string,
  rceptNo: string,
  accountId: string,
  amount3m: string,
  amountCum: string,
  supersededBy: string | null = null,
) {
  return {
    id: `${rceptNo}-${accountId}`,
    corp_code: CORP,
    bsns_year: 2024,
    reprt_code: reprtCode,
    fs_div: "CFS",
    account_id: accountId,
    amount_3m: amount3m,
    amount_cum: amountCum,
    source_rcept_no: rceptNo,
    superseded_by: supersededBy,
  };
}

const REVENUE = "ifrs-full_Revenue";
const OP = "dart_OperatingIncomeLoss";

function fetchState(bsnsYear: number, reprtCode: string, rceptNo: string | null) {
  return {
    corp_code: CORP,
    bsns_year: bsnsYear,
    reprt_code: reprtCode,
    fs_div_used: rceptNo ? "CFS" : null,
    rcept_no: rceptNo,
    checked_at: new Date().toISOString(),
  };
}

function sampleDb() {
  return createFakeFinancialsDb({
    account_map: ACCOUNT_MAP_SEED_ROWS,
    companies: [{ corp_code: CORP, acc_mt: 12, sectors: { is_financial: false } }],
    report_values: [
      value("11013", A1, REVENUE, "1000", "1000"),
      value("11013", A1, OP, "200", "200"),
      value("11012", B1, REVENUE, "1100", "2100"),
      value("11014", C0, REVENUE, "1200", "3300", `${C1}-${REVENUE}`),
      value("11014", C0, OP, "280", "760", `${C1}-${OP}`),
      value("11014", C1, REVENUE, "1250", "3350"),
      value("11014", C1, OP, "300", "780"),
    ],
    // 증감률용 앞 분기(2023년)는 보고서가 없다(013)고 이미 확인해 둔 상태 — 외부 호출 없음
    report_fetch_state: [
      fetchState(2023, "11013", null),
      fetchState(2023, "11012", null),
      fetchState(2023, "11014", null),
      fetchState(2023, "11011", null),
      fetchState(2024, "11013", A1),
      fetchState(2024, "11012", B1),
      fetchState(2024, "11014", C1),
    ],
  });
}

/** 시리즈의 [분기, 값] 목록 */
function points(result: ResultObject, key: string): [string, number | null][] {
  const series = result.charts.flatMap((c) => c.series).find((s) => s.key === key)!;
  return series.points.map((p) => [p.x, result.figures[p.figureId].value]);
}

describe("WU-203 전처리 진단 — 고정 샘플의 처리 전후 행 수·합계", () => {
  it("확인이 필요한 진단(결측·정정 중복)이 있으면 계산 전에 멈추고, 미리보기가 손 계산과 같다", async () => {
    const { client } = sampleDb();
    const outcome = await runAnalysis(request, { client, userId: USER, requireConfirmation: true });
    expect(outcome.kind).toBe("needs_preprocess");
    if (outcome.kind !== "needs_preprocess") return;

    const [missing, duplicate, ...rest] = outcome.diagnoses;
    expect(rest).toEqual([]);

    expect(missing).toMatchObject({
      id: "missing_account",
      needsConfirmation: true,
      affectedRows: 1,
    });
    expect(missing.description).toContain("2024Q2");
    expect(missing.options).toEqual([
      {
        id: "exclude_quarter",
        label: "해당 분기 제외",
        isDefault: true,
        preview: { rowsBefore: 3, rowsAfter: 2, sumBefore: 3350, sumAfter: 2250 },
      },
      {
        id: "show_blank",
        label: "0으로 보지 않고 빈칸으로 표시",
        isDefault: false,
        preview: { rowsBefore: 3, rowsAfter: 3, sumBefore: 3350, sumAfter: 3350 },
      },
    ]);

    expect(duplicate).toMatchObject({
      id: "duplicate_correction",
      needsConfirmation: true,
      affectedRows: 1,
    });
    expect(duplicate.options.map((o) => [o.id, o.preview])).toEqual([
      ["latest_correction", { rowsBefore: 4, rowsAfter: 3, sumBefore: 4550, sumAfter: 3350 }],
      ["first_filing", { rowsBefore: 4, rowsAfter: 3, sumBefore: 4550, sumAfter: 3300 }],
    ]);
  });

  it("고른 처리(분기 제외·최초 공시)대로 계산하고, 원본 report_values는 바뀌지 않는다", async () => {
    const { client, tables } = sampleDb();
    const before = JSON.stringify(tables.report_values);
    const first = await runAnalysis(request, { client, userId: USER, requireConfirmation: true });
    if (first.kind !== "needs_preprocess") throw new Error("진단에서 멈춰야 한다");

    const decisions = toDecisions(first.diagnoses, [
      { diagnosisId: "missing_account", optionId: "exclude_quarter" },
      { diagnosisId: "duplicate_correction", optionId: "first_filing" },
    ]);
    const done = await runAnalysis(request, {
      client,
      userId: USER,
      requireConfirmation: true,
      decisions,
    });
    expect(done.kind).toBe("done");
    if (done.kind !== "done") return;

    expect(points(done.result, "revenue")).toEqual([
      ["2024Q1", 1000],
      ["2024Q3", 1200],
    ]);
    expect(points(done.result, "operating_income")).toEqual([
      ["2024Q1", 200],
      ["2024Q3", 280],
    ]);
    expect(done.result.usedData.rows).toBe(2);
    expect(done.result.basis.flags).toEqual(
      expect.arrayContaining(["계정 값이 빈 분기 제외: 2024Q2", "정정 공시: 최초 공시 값 사용"]),
    );
    // 선택이 데이터 버전에 남고, 최초 공시를 쓴 보고서에는 수집 당시 최신 접수번호가 함께 남는다
    expect(done.version.decisions).toEqual({
      missing_account: "exclude_quarter",
      duplicate_correction: "first_filing",
    });
    expect(
      done.version.sources.find((s) => s.bsnsYear === 2024 && s.reprtCode === "11014"),
    ).toMatchObject({
      rceptNo: C0,
      collected: { fsDiv: "CFS", rceptNo: C1 },
    });

    expect(JSON.stringify(tables.report_values)).toBe(before);
  });

  it("확인 없이 실행(비로그인 예시)하면 기본값(분기 제외·최신 정정본)으로 계산한다", async () => {
    const { client } = sampleDb();
    const done = await runAnalysis(request, { client, requireConfirmation: false });
    if (done.kind !== "done") throw new Error("기본값으로 끝까지 계산해야 한다");
    expect(points(done.result, "revenue")).toEqual([
      ["2024Q1", 1000],
      ["2024Q3", 1250],
    ]);
  });
});

describe("WU-202 데이터 버전 — 같은 조건 재실행은 언제 해도 같은 숫자", () => {
  async function decidedRun(client: ReturnType<typeof sampleDb>["client"]) {
    const done = await runAnalysis(request, {
      client,
      userId: USER,
      requireConfirmation: true,
      decisions: { missing_account: "show_blank", duplicate_correction: "latest_correction" },
    });
    if (done.kind !== "done") throw new Error("선택이 있으니 끝까지 계산해야 한다");
    return done;
  }

  it("같은 데이터 버전으로 다시 계산하면 숫자·데이터 버전 ID가 모두 같다", async () => {
    const { client } = sampleDb();
    const original = await decidedRun(client);
    const rerun = await runAnalysis(request, { client, userId: USER, version: original.version });
    if (rerun.kind !== "done") throw new Error("재실행은 진단 없이 끝나야 한다");

    expect(sameNumbers(original.result, rerun.result)).toBe(true);
    expect(rerun.result.basis.dataVersionId).toBe(original.result.basis.dataVersionId);
    expect(rerun.versionHash).toBe(original.versionHash);
    expect(points(rerun.result, "operating_income")).toEqual([
      ["2024Q1", 200],
      ["2024Q2", null],
      ["2024Q3", 300],
    ]);
  });

  it("새 정정 공시가 반영돼도 옛 버전 재실행은 옛 숫자 그대로이고, '새 데이터 있음'이 켜진다", async () => {
    const { client, tables } = sampleDb();
    const original = await decidedRun(client);
    expect(await isNewerDataAvailable(client, original.version.sources)).toBe(false);

    // 3분기보고서 2차 정정(C2)이 수집됐다 — 원본은 지우지 않고 새 행 추가 + 옛 행에 superseded_by
    for (const row of tables.report_values) {
      if (row.source_rcept_no === C1) row.superseded_by = `${C2}-${row.account_id}`;
    }
    tables.report_values.push(
      value("11014", C2, REVENUE, "1300", "3400"),
      value("11014", C2, OP, "310", "790"),
    );
    const state = tables.report_fetch_state.find(
      (r) => r.bsns_year === 2024 && r.reprt_code === "11014",
    )!;
    state.rcept_no = C2;

    expect(await isNewerDataAvailable(client, original.version.sources)).toBe(true);

    const rerun = await runAnalysis(request, { client, userId: USER, version: original.version });
    if (rerun.kind !== "done") throw new Error("재실행은 진단 없이 끝나야 한다");
    expect(sameNumbers(original.result, rerun.result)).toBe(true);
    expect(points(rerun.result, "revenue")[2]).toEqual(["2024Q3", 1250]);

    // 최신 데이터로 새로 계산하면 새 정정본 값·다른 데이터 버전
    const latest = await decidedRun(client);
    expect(points(latest.result, "revenue")[2]).toEqual(["2024Q3", 1300]);
    expect(latest.result.basis.dataVersionId).not.toBe(original.result.basis.dataVersionId);
  });
});
