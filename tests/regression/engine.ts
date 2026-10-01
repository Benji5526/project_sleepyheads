// 회귀 세트 숫자 정답 확인용 엔진 연결 (WU-503). tests/accuracy와 같은 방식이다:
// tests/accuracy/fixtures/*.json (OpenDART 원문에서 옮긴 값) → 가짜 dartFetch → **실제 엔진**
// (ensureCompanyFinancials → 달력 분기 지표) → 정답(answers/*.json, 예림)과 비교. 외부 호출·AI 0건.
//
// 이 파일은 dartFetch를 가짜로 바꾸는 vi.mock을 쓰는 테스트 파일에서만 불러야 한다 (regression.test.ts).
import type { CompanyRef, NullReason, Quarter } from "@/contracts";
import type { DartFinancialStatementItem } from "@/lib/financials/types";
import { qoq, yoy } from "@/lib/metrics/formulas";
import type { Computed } from "@/lib/metrics/types";
import { ensureCompanyFinancials, type CompanyFinancials } from "@/lib/runner/company-financials";
import dongwonMobility from "../accuracy/fixtures/dongwon-mobility.json";
import kbFinancial from "../accuracy/fixtures/kb-financial.json";
import leenoIndustrial from "../accuracy/fixtures/leeno-industrial.json";
import samsungElectronics from "../accuracy/fixtures/samsung-electronics.json";
import sewonPrecision from "../accuracy/fixtures/sewon-precision.json";
import shinhanFinancial from "../accuracy/fixtures/shinhan-financial.json";
import skHynix from "../accuracy/fixtures/sk-hynix.json";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { createFakeFinancialsDb } from "../unit/helpers/fake-financials-db";

interface FixtureReport {
  bsns_year: string;
  reprt_code: string;
  fs_div: string;
  rcept_no: string;
  thstrm_nm: string;
  rows: {
    sj_div: string;
    account_id: string;
    account_nm: string;
    thstrm_amount: string;
    thstrm_add_amount?: string;
  }[];
}
interface AccuracyFixture {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  market: string;
  acc_mt: number;
  is_financial: boolean;
  reports: FixtureReport[];
}

/** answers/*.json의 `company` 값 → 원문 fixture */
export const FIXTURES: Record<string, AccuracyFixture> = {
  skHynix: skHynix as AccuracyFixture,
  samsung: samsungElectronics as AccuracyFixture,
  kb: kbFinancial as AccuracyFixture,
  shinhan: shinhanFinancial as AccuracyFixture,
  dongwonMobility: dongwonMobility as AccuracyFixture,
  sewonPrecision: sewonPrecision as AccuracyFixture,
  leeno: leenoIndustrial as AccuracyFixture,
};

/** 가짜 OpenDART 응답 — fixture에 없는 보고서는 013(조회된 데이터 없음) */
export function fakeDartResponse(params: Record<string, string | number | undefined>) {
  const fixture = Object.values(FIXTURES).find((f) => f.corp_code === params.corp_code);
  const report = fixture?.reports.find(
    (r) =>
      r.bsns_year === String(params.bsns_year) &&
      r.reprt_code === params.reprt_code &&
      r.fs_div === params.fs_div,
  );
  if (!fixture || !report) return { status: "013", message: "조회된 데이타가 없습니다." };
  const list: DartFinancialStatementItem[] = report.rows.map((row) => ({
    rcept_no: report.rcept_no,
    reprt_code: report.reprt_code,
    bsns_year: report.bsns_year,
    corp_code: fixture.corp_code,
    sj_nm: "",
    account_detail: "-",
    thstrm_nm: report.thstrm_nm,
    frmtrm_nm: "",
    frmtrm_amount: "",
    bfefrmtrm_nm: "",
    bfefrmtrm_amount: "",
    ord: "",
    currency: "KRW",
    ...row,
  }));
  return { status: "000", message: "정상", list };
}

function companyRef(f: AccuracyFixture): CompanyRef {
  return {
    corpCode: f.corp_code,
    stockCode: f.stock_code,
    name: f.corp_name,
    market: f.market as CompanyRef["market"],
    sector: { name: "", source: "other", isFinancial: f.is_financial },
    fiscalMonth: f.acc_mt,
  };
}

const db = createFakeFinancialsDb({
  account_map: ACCOUNT_MAP_SEED_ROWS,
  companies: Object.values(FIXTURES).map((f) => ({
    corp_code: f.corp_code,
    acc_mt: f.acc_mt,
    sectors: { is_financial: f.is_financial },
  })),
});
const cache = new Map<string, Promise<CompanyFinancials>>();

/** fixture가 덮는 범위 (2024Q3~2026Q2 — QoQ·YoY용 앞 분기 포함) */
function financialsOf(company: string): Promise<CompanyFinancials> {
  const fixture = FIXTURES[company];
  if (!fixture)
    throw new Error(`answers의 company "${company}"는 tests/accuracy/fixtures에 없습니다`);
  let found = cache.get(company);
  if (!found) {
    found = ensureCompanyFinancials(companyRef(fixture), "2024Q3", "2026Q2", { client: db.client });
    cache.set(company, found);
  }
  return found;
}

/** 엔진이 낸 값: 금액은 원 단위 정수 글자, 비율은 숫자, 계산 불가는 null + 사유 */
export interface EngineValue {
  value: string | number | null;
  reason?: NullReason | "SIGN_CHANGE";
}

function fromComputed(c: Computed<bigint> | Computed<number> | undefined): EngineValue {
  if (!c) return { value: null, reason: "MISSING_ACCOUNT" };
  if (c.value === null) return { value: null, reason: c.reason };
  return { value: typeof c.value === "bigint" ? c.value.toString() : c.value };
}

function prevQuarter(q: Quarter, back: number): Quarter {
  let year = Number(q.slice(0, 4));
  let quarter = Number(q.slice(5));
  for (let i = 0; i < back; i += 1) {
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return `${year}Q${quarter}` as Quarter;
}

/** 증감률 대상 지표 — "qoq:operating_income"처럼 쓴다 */
const CHANGE_RE = /^(qoq|yoy):(revenue|operating_income|net_income)$/;
/** 연간 합 — "annual:revenue"처럼 쓰고 quarter 자리에 연도("2025") */
const ANNUAL_RE = /^annual:(revenue|operating_income|net_income)$/;

/**
 * 정답 한 줄을 엔진으로 계산한다.
 * - metric: CalendarQuarterMetrics 칸(revenue·operating_income·net_income·operating_margin·debt_ratio …),
 *   `qoq:<지표>`·`yoy:<지표>`, `annual:<지표>`(연도 합)
 * - per·pbr·market_cap은 주가 결합(WU-502, 예림)이 병합된 뒤 여기에 연결한다 — 지금은 "아직 연결 전" 오류
 */
export async function engineValue(
  company: string,
  metric: string,
  period: string,
): Promise<EngineValue> {
  if (/^(per|pbr|market_cap)$/.test(metric)) {
    throw new Error(`${metric}: 주가 결합(WU-502) 병합 뒤 회귀 엔진에 연결 (통합 때)`);
  }
  const financials = await financialsOf(company);
  const at = (q: Quarter) => financials.metricsByQuarter.get(q)?.metrics;

  const annual = ANNUAL_RE.exec(metric);
  if (annual) {
    const key = annual[1] as "revenue";
    const quarters = [1, 2, 3, 4].map((n) => at(`${period}Q${n}` as Quarter)?.[key]);
    if (quarters.some((c) => !c || c.value === null))
      return { value: null, reason: "MISSING_ACCOUNT" };
    return {
      value: quarters.reduce((sum, c) => sum + (c!.value as bigint), BigInt(0)).toString(),
    };
  }

  const quarter = period as Quarter;
  const change = CHANGE_RE.exec(metric);
  if (change) {
    const [, kind, key] = change as unknown as [string, "qoq" | "yoy", "revenue"];
    const current = at(quarter)?.[key];
    if (!current) return { value: null, reason: "MISSING_ACCOUNT" };
    const base = at(prevQuarter(quarter, kind === "qoq" ? 1 : 4))?.[key];
    const result = (kind === "qoq" ? qoq : yoy)(current, base, key !== "revenue");
    if ("signChange" in result) return { value: result.signChange, reason: "SIGN_CHANGE" };
    return fromComputed(result);
  }

  const metrics = at(quarter);
  if (!metrics) return { value: null, reason: "NO_REPORT" };
  // 정답 파일의 지표 이름 오타가 "계정 값 없음"으로 조용히 통과하지 않게
  if (!Object.hasOwn(metrics, metric)) throw new Error(`엔진에 없는 지표 이름: ${metric}`);
  return fromComputed(metrics[metric as keyof typeof metrics] as Computed<bigint>);
}

/**
 * 계산 규칙 정답 (실제 공시에서 보기 드문 경우 — 분모 0·직전 분기 없음): 입력을 고정해 계산식만 확인한다.
 * answers 한 줄에 `formula`와 `inputs`를 적는다: { formula: "qoq", inputs: { current: "100", previous: "0" } }.
 * previous가 null이면 "직전 값 없음".
 * `profit: true`면 이익 지표 규칙(부호가 바뀌면 흑자전환·적자전환, TECH §6.4) — 0 → 양수는 "흑자전환"이 정답이다.
 * 기본은 매출 같은 지표 규칙이라 0 → 양수는 "분모 0".
 */
export function formulaValue(
  formula: string,
  inputs: { current: string; previous: string | null; profit?: boolean },
): EngineValue {
  const current: Computed<bigint> = { value: BigInt(inputs.current) };
  const previous: Computed<bigint> | undefined =
    inputs.previous === null ? undefined : { value: BigInt(inputs.previous) };
  if (formula !== "qoq" && formula !== "yoy") throw new Error(`지원하지 않는 계산식: ${formula}`);
  const result = (formula === "qoq" ? qoq : yoy)(current, previous, inputs.profit ?? false);
  if ("signChange" in result) return { value: result.signChange, reason: "SIGN_CHANGE" };
  return fromComputed(result);
}
