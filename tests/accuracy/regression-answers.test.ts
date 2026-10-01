// WU-503 숫자 정답(tests/regression/answers/*.json, 예림) ↔ 실제 엔진. 정답은 OpenDART 원문·주가 API 값을 손으로 계산한 것이고,
// 이 테스트는 원문을 옮긴 fixture를 가짜 전자공시·가짜 주가 API로 돌려 실행기(runAnalysis)가 같은 숫자를 내는지 본다.
// 회귀 세트(현준, tests/regression/cases)는 `answerRef: "answers/<file>#<key>"`로 같은 정답을 가리킨다 —
// 정답 파일이 엔진과 어긋나지 않았다는 것을 여기서 먼저 보장한다. 'synthetic' 정답은 단위 테스트가 맡는다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AnalysisRequestView, CompanyRef, Figure, MetricId, Quarter } from "@/contracts";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { createFakeFinancialsDb } from "../unit/helpers/fake-financials-db";
import compareAnswers from "../regression/answers/compare.json";
import edgeAnswers from "../regression/answers/edge.json";
import skHynixAnswers from "../regression/answers/skhynix.json";
import dongwonMobility from "./fixtures/dongwon-mobility.json";
import kbFinancial from "./fixtures/kb-financial.json";
import samsungElectronics from "./fixtures/samsung-electronics.json";
import skHynix from "./fixtures/sk-hynix.json";
import skHynixValuation from "./fixtures/sk-hynix-valuation.json";

const { dartFetchMock, priceFetchMock } = vi.hoisted(() => ({
  dartFetchMock: vi.fn(),
  priceFetchMock: vi.fn(),
}));
vi.mock("@/lib/dart/client", () => ({ dartFetch: dartFetchMock }));
vi.mock("@/lib/price/client", () => ({ priceFetch: priceFetchMock }));

const { runAnalysis } = await import("@/lib/runner/execute");

interface FixtureReport {
  bsns_year: string;
  reprt_code: string;
  fs_div: string;
  rcept_no: string;
  rows: Record<string, string>[];
}

const REPORTS: { corp: string; report: FixtureReport }[] = [
  ...[skHynix, skHynixValuation, samsungElectronics, kbFinancial, dongwonMobility].flatMap((f) =>
    (f.reports as FixtureReport[]).map((report) => ({
      corp: (f as { corp_code: string }).corp_code,
      report,
    })),
  ),
];

function fakeDart(path: string, params: Record<string, unknown>) {
  if (path !== "fnlttSinglAcntAll.json") return { status: "013", message: "없음" };
  // 같은 보고서가 두 fixture에 나뉘어 있으면(매출 등 / 지배주주 행) 합친다
  const found = REPORTS.filter(
    ({ corp, report: r }) =>
      corp === params.corp_code &&
      r.bsns_year === String(params.bsns_year) &&
      r.reprt_code === params.reprt_code &&
      r.fs_div === params.fs_div,
  );
  if (found.length === 0) return { status: "013", message: "조회된 데이타가 없습니다." };
  const { report } = found[0];
  return {
    status: "000",
    message: "정상",
    list: found.flatMap(({ report: r }) =>
      r.rows.map((row) => ({
        rcept_no: report.rcept_no,
        reprt_code: report.reprt_code,
        bsns_year: report.bsns_year,
        corp_code: String(params.corp_code),
        sj_nm: "",
        account_detail: "-",
        thstrm_nm: "",
        thstrm_add_amount: "",
        frmtrm_nm: "",
        frmtrm_amount: "",
        bfefrmtrm_nm: "",
        bfefrmtrm_amount: "",
        ord: "",
        currency: "KRW",
        ...row,
      })),
    ),
  };
}

function company(
  corpCode: string,
  stockCode: string,
  name: string,
  sector: string,
  isFinancial = false,
  fiscalMonth = 12,
): CompanyRef {
  return {
    corpCode,
    stockCode,
    name,
    market: "KOSPI",
    sector: { name: sector, source: "manual", isFinancial },
    fiscalMonth,
  };
}
const COMPANIES: Record<string, CompanyRef> = {
  SK하이닉스: company("00164779", "000660", "SK하이닉스", "반도체"),
  삼성전자: company("00126380", "005930", "삼성전자", "반도체"),
  KB금융: company("00688996", "105560", "KB금융", "금융지주", true),
  동원모빌리티: company("00118008", "005870", "동원모빌리티", "자동차/부품", false, 3),
};

function db() {
  return createFakeFinancialsDb({
    account_map: ACCOUNT_MAP_SEED_ROWS,
    issue_rules: [],
    stock_prices: [],
    companies: Object.values(COMPANIES).map((c) => ({
      corp_code: c.corpCode,
      stock_code: c.stockCode,
      acc_mt: c.fiscalMonth,
      sectors: { is_financial: c.sector.isFinancial },
    })),
  });
}

interface AnswerFigure {
  label: string;
  value: number | null;
  unit: string;
  display?: string;
  reason?: string;
  priceDate?: string;
}
interface Answer {
  synthetic?: boolean;
  question: string;
  metrics: MetricId[];
  period: { from: Quarter; to: Quarter };
  groupBy?: AnalysisRequestView["groupBy"];
  now?: string;
  figures: AnswerFigure[];
  flags?: string[];
}

/** 정답 질문 → 분석 요청 (질문 해석은 AI라 회귀 세트가 고정 응답으로 맡는다 — 여기는 숫자만) */
function requestFor(answer: Answer, companies: CompanyRef[]): AnalysisRequestView {
  const [target, ...peers] = companies;
  return {
    intent: peers.length > 0 ? "compare" : "recent",
    target,
    peers,
    metrics: answer.metrics,
    period: { ...answer.period, specified: true, reason: "회귀 정답", clipped: false },
    groupBy: answer.groupBy ?? "quarter",
    needsNews: false,
  };
}

function companiesIn(answer: Answer, fallback: string): CompanyRef[] {
  const named = Object.keys(COMPANIES).filter((name) => answer.question.includes(name));
  return (named.length > 0 ? named : [fallback]).map((n) => COMPANIES[n]);
}

function expectFigures(figures: Record<string, Figure>, expected: AnswerFigure[]) {
  const byLabel = new Map(Object.values(figures).map((f) => [f.label, f]));
  for (const want of expected) {
    const got = byLabel.get(want.label);
    expect(got, `${want.label} 숫자가 결과에 없다`).toBeDefined();
    if (want.value === null) expect(got!.value).toBeNull();
    else if (want.unit === "KRW") expect(got!.value).toBe(want.value);
    // 정답은 소수 넷째 자리 반올림
    else expect(Math.abs(got!.value! - want.value)).toBeLessThan(0.00005 + 1e-9);
    expect(got!.unit).toBe(want.unit);
    if (want.display) expect(got!.display).toBe(want.display);
    if (want.reason) expect(got!.reason).toBe(want.reason);
    if (want.priceDate) expect(got!.basis.priceDate).toBe(want.priceDate);
  }
}

const PRICE_ITEMS = skHynixValuation.prices.map((p) => ({
  ...p,
  clpr: String(p.clpr),
  lstgStCnt: String(p.lstgStCnt),
}));

beforeEach(() => {
  dartFetchMock.mockReset();
  dartFetchMock.mockImplementation(async (path: string, params: Record<string, unknown>) =>
    fakeDart(path, params),
  );
  priceFetchMock.mockReset();
  priceFetchMock.mockImplementation(async () => ({
    response: {
      header: { resultCode: "00", resultMsg: "OK" },
      body: { items: { item: PRICE_ITEMS } },
    },
  }));
});

const files: [string, Record<string, unknown>, string][] = [
  ["skhynix", skHynixAnswers, "SK하이닉스"],
  ["compare", compareAnswers, "SK하이닉스"],
  ["edge", edgeAnswers, "SK하이닉스"],
];

/** 이 테스트에 원문 fixture가 있는 정답만 (부채비율 비교는 compare-financial.test.ts가 다른 fixture로 확인) */
const COVERED_ELSEWHERE = new Set(["compare#debt_ratio_2024q4_with_financial"]);

/** 이 테스트 형식(질문 + 숫자 목록)인가 */
function isDetailed(raw: unknown): raw is Answer {
  return typeof raw === "object" && raw !== null && "question" in raw && "figures" in raw;
}

describe("회귀 세트 숫자 정답 ↔ 엔진 (tests/regression/answers)", () => {
  for (const [file, answers, fallback] of files) {
    for (const [key, raw] of Object.entries(answers)) {
      if (key.startsWith("_")) continue;
      const answer = raw as Answer;
      // 회귀 세트 형식(company·metric·period 한 줄 — tests/regression/regression.test.ts가 돌린다)은 건너뛴다
      if (!isDetailed(answer)) continue;
      if (answer.synthetic || COVERED_ELSEWHERE.has(`${file}#${key}`)) continue;
      it(`answers/${file}.json#${key} — "${answer.question}"`, async () => {
        const companies = companiesIn(answer, fallback);
        const now = answer.now ? new Date(answer.now) : new Date("2026-10-01T03:00:00Z");
        const outcome = await runAnalysis(requestFor(answer, companies), {
          client: db().client,
          now: () => now,
        });
        if (outcome.kind !== "done") throw new Error(outcome.kind);
        expectFigures(outcome.result.figures, answer.figures);
        for (const flag of answer.flags ?? []) expect(outcome.result.basis.flags).toContain(flag);
      });
    }
  }
});

describe("정답 파일 모양 (회귀 세트가 answerRef로 가리킨다)", () => {
  it.each(files)(
    "answers/%s.json: 키마다 질문·기간·지표·숫자가 있고 원문 근거가 있다",
    (_file, answers) => {
      for (const [key, raw] of Object.entries(answers)) {
        if (key.startsWith("_") || !isDetailed(raw)) continue;
        const answer = raw as Answer & { rceptNo?: string[]; fixture?: string; inputs?: unknown };
        expect(answer.question, key).toBeTruthy();
        expect(answer.metrics.length, key).toBeGreaterThan(0);
        expect(answer.figures.length, key).toBeGreaterThan(0);
        // 원문 접수번호·fixture·가상 입력 중 하나는 있어야 손 계산을 다시 해 볼 수 있다
        expect(Boolean(answer.rceptNo?.length || answer.fixture || answer.inputs), key).toBe(true);
        for (const f of answer.figures) {
          if (f.value === null) expect(f.reason ?? f.display, `${key} ${f.label}`).toBeTruthy();
        }
      }
    },
  );
});
