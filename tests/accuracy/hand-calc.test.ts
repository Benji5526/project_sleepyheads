// WU-199 Step 1 통과 테스트 ① + WU-106 "원문 손 계산과 일치" — 손 계산 정답표(ANSWER_KEY.md) 대조.
//
// 흐름: tests/accuracy/fixtures/*.json (DART 원문에서 옮긴 값) → 가짜 dartFetch → 실제 엔진
// (ensureReportValues → report_values → computeCalendarQuarterMetrics → series-builders)
// → 이 파일에 **글자 그대로 적은** 정답(ANSWER_KEY.md의 손 계산, 엔진을 부르지 않고 덧셈·뺄셈으로 구함)과 비교.
//
// 엔진이 손 계산과 다른 경우는 정답이나 src를 고치지 않고 `it.fails`로 표시한다 (KNOWN_ENGINE_BUGS 참고).
// it.fails는 "지금은 틀리는 게 정상"이라는 뜻이다 — 엔진을 고치면 이 테스트가 빨간불이 되므로
// 그때 it.fails를 it으로 바꾸면 된다.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { CompanyRef, Quarter } from "@/contracts";
import { classifySector } from "@/lib/companies/classify-sector";
import type { DartFinancialStatementItem } from "@/lib/financials/types";
import type { Computed } from "@/lib/metrics/types";
import { ensureCompanyFinancials, type CompanyFinancials } from "@/lib/runner/company-financials";
import { createFigureAllocator } from "@/lib/runner/figures";
import {
  buildAnnualSeries,
  buildCompanyComparisonSeries,
  buildQuarterlySeries,
  buildSumSeries,
  sumPeriods,
} from "@/lib/runner/series-builders";
import { ACCOUNT_MAP_SEED_ROWS } from "../fixtures/mock/account-map";
import { createFakeFinancialsDb } from "../unit/helpers/fake-financials-db";
import dongwonMobility from "./fixtures/dongwon-mobility.json";
import kbFinancial from "./fixtures/kb-financial.json";
import leenoIndustrial from "./fixtures/leeno-industrial.json";
import samsungElectronics from "./fixtures/samsung-electronics.json";
import sewonPrecision from "./fixtures/sewon-precision.json";
import shinhanFinancial from "./fixtures/shinhan-financial.json";
import skHynix from "./fixtures/sk-hynix.json";

const { dartFetchMock } = vi.hoisted(() => ({ dartFetchMock: vi.fn() }));
vi.mock("@/lib/dart/client", () => ({ dartFetch: dartFetchMock }));

// ---------------------------------------------------------------------------
// fixture → 가짜 OpenDART 응답
// ---------------------------------------------------------------------------

interface FixtureRow {
  sj_div: string;
  account_id: string;
  account_nm: string;
  thstrm_amount: string;
  thstrm_add_amount?: string;
}

interface FixtureReport {
  bsns_year: string;
  reprt_code: string;
  fs_div: string;
  rcept_no: string;
  report_nm: string;
  thstrm_nm: string;
  use: string;
  rows: FixtureRow[];
}

interface AccuracyFixture {
  corp_code: string;
  corp_name: string;
  stock_code: string;
  market: string;
  acc_mt: number;
  induty_code: string;
  is_financial: boolean;
  reports: FixtureReport[];
}

type SampleKey =
  "skHynix" | "samsung" | "kb" | "shinhan" | "dongwonMobility" | "sewonPrecision" | "leeno";

const FIXTURES: Record<SampleKey, AccuracyFixture> = {
  skHynix: skHynix as AccuracyFixture,
  samsung: samsungElectronics as AccuracyFixture,
  kb: kbFinancial as AccuracyFixture,
  shinhan: shinhanFinancial as AccuracyFixture,
  dongwonMobility: dongwonMobility as AccuracyFixture,
  sewonPrecision: sewonPrecision as AccuracyFixture,
  leeno: leenoIndustrial as AccuracyFixture,
};
const SAMPLE_KEYS = Object.keys(FIXTURES) as SampleKey[];
const NON_FINANCIAL: SampleKey[] = [
  "skHynix",
  "samsung",
  "dongwonMobility",
  "sewonPrecision",
  "leeno",
];

function fakeDartResponse(params: Record<string, string | number | undefined>) {
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

// ---------------------------------------------------------------------------
// 손 계산 정답 (ANSWER_KEY.md §2에서 그대로 옮김. 원 단위. 금융사 매출 null = 원문에 영업수익 행 없음)
// [매출, 영업이익, 순이익]
// ---------------------------------------------------------------------------

type Triple = [string | null, string, string];
const QUARTERS: Quarter[] = [
  "2024Q3",
  "2024Q4",
  "2025Q1",
  "2025Q2",
  "2025Q3",
  "2025Q4",
  "2026Q1",
  "2026Q2",
];
const LATEST_FOUR: Quarter[] = ["2025Q3", "2025Q4", "2026Q1", "2026Q2"];

const EXPECTED: Record<SampleKey, Record<string, Triple>> = {
  skHynix: {
    "2024Q3": ["17573069000000", "7029958000000", "5753373000000"],
    "2024Q4": ["19767035000000", "8082796000000", "8006487000000"],
    "2025Q1": ["17639141000000", "7440504000000", "8108195000000"],
    "2025Q2": ["22231952000000", "9212851000000", "6996216000000"],
    "2025Q3": ["24448929000000", "11383390000000", "12597538000000"],
    "2025Q4": ["32826653000000", "19169574000000", "15245953000000"],
    "2026Q1": ["52576287000000", "37610283000000", "40345909000000"],
    "2026Q2": ["79318746000000", "60542608000000", "93922593000000"],
  },
  samsung: {
    "2024Q3": ["79098731000000", "9183371000000", "10100904000000"],
    "2024Q4": ["75788269000000", "6492703000000", "7754394000000"],
    "2025Q1": ["79140503000000", "6685272000000", "8222878000000"],
    "2025Q2": ["74566317000000", "4676057000000", "5116435000000"],
    "2025Q3": ["86061747000000", "12166062000000", "12225747000000"],
    "2025Q4": ["93837371000000", "20073660000000", "19641745000000"],
    "2026Q1": ["133873444000000", "57232797000000", "47225272000000"],
    "2026Q2": ["171499470000000", "89492412000000", "71624461000000"],
  },
  kb: {
    "2024Q3": [null, "2357551000000", "1596039000000"],
    "2024Q4": [null, "1030013000000", "658688000000"],
    "2025Q1": [null, "2293028000000", "1699122000000"],
    "2025Q2": [null, "2132971000000", "1747580000000"],
    "2025Q3": [null, "2334990000000", "1655228000000"],
    "2025Q4": [null, "1756722000000", "738785000000"],
    "2026Q1": [null, "2727566000000", "1916469000000"],
    "2026Q2": [null, "2712548000000", "2010508000000"],
  },
  shinhan: {
    "2024Q3": [null, "1869897000000", "1325449000000"],
    "2024Q4": [null, "667994000000", "433906000000"],
    "2025Q1": [null, "1944214000000", "1517046000000"],
    "2025Q2": [null, "2014257000000", "1577234000000"],
    "2025Q3": [null, "1954623000000", "1452190000000"],
    "2025Q4": [null, "1110263000000", "538049000000"],
    "2026Q1": [null, "2154453000000", "1649148000000"],
    "2026Q2": [null, "2476281000000", "1846651000000"],
  },
  dongwonMobility: {
    "2024Q3": ["149326944732", "4562199365", "360383316"],
    "2024Q4": ["149993559358", "6646719356", "-190210855"],
    "2025Q1": ["163172807518", "15422420200", "13157420665"],
    "2025Q2": ["168011332257", "13053102374", "5470539844"],
    "2025Q3": ["155607687238", "8452546629", "9854379024"],
    "2025Q4": ["157103469319", "7440987125", "10598536367"],
    "2026Q1": ["178815012796", "6061280672", "13121472314"],
    "2026Q2": ["193668847572", "14414948492", "13922179766"],
  },
  sewonPrecision: {
    "2024Q3": ["34235328138", "3642391534", "10745839667"],
    "2024Q4": ["35415718006", "5037924581", "18665932458"],
    "2025Q1": ["49078117507", "208705985", "3259372469"],
    "2025Q2": ["60624623098", "8138902516", "16083012596"],
    "2025Q3": ["39161565860", "7875695264", "13909680169"],
    "2025Q4": ["41966689502", "5123165081", "14017160113"],
    "2026Q1": ["38386118125", "-670017127", "2020851479"],
    "2026Q2": ["58490381670", "11293500698", "25374390645"],
  },
  leeno: {
    "2024Q3": ["68935963551", "30669332518", "24529519052"],
    "2024Q4": ["83418844888", "37020238710", "38299684531"],
    "2025Q1": ["78410243553", "34937759810", "29344420543"],
    "2025Q2": ["112522064123", "53444357551", "41110227661"],
    "2025Q3": ["96841827642", "48261344084", "41914466281"],
    "2025Q4": ["84759949290", "40353726844", "39591555921"],
    "2026Q1": ["99771175834", "47300587489", "40395613639"],
    "2026Q2": ["143187426964", "73513742404", "65922968641"],
  },
};

/** YoY % (ANSWER_KEY.md §3, 소수점 넷째 자리 반올림). [매출, 영업이익, 순이익], 금융사 매출 null. */
// 부호가 바뀐 이익 지표는 TECH §6.4대로 비율 대신 글자 ("흑자전환" 등)가 정답이다
const EXPECTED_YOY: Record<
  SampleKey,
  Record<string, [number | null, number | string, number | string]>
> = {
  skHynix: {
    "2025Q3": [39.1273, 61.9269, 118.9592],
    "2025Q4": [66.0677, 137.1651, 90.42],
    "2026Q1": [198.066, 405.4803, 397.5942],
    "2026Q2": [256.7781, 557.1539, 1242.477],
  },
  samsung: {
    "2025Q3": [8.8029, 32.4793, 21.0362],
    "2025Q4": [23.8152, 209.1726, 153.2983],
    "2026Q1": [69.1592, 756.1027, 474.3156],
    "2026Q2": [129.9959, 1813.8435, 1299.89],
  },
  kb: {
    "2025Q3": [null, -0.957, 3.7085],
    "2025Q4": [null, 70.5534, 12.1601],
    "2026Q1": [null, 18.9504, 12.7917],
    "2026Q2": [null, 27.1723, 15.0453],
  },
  shinhan: {
    "2025Q3": [null, 4.5311, 9.5621],
    "2025Q4": [null, 66.2085, 24.0013],
    "2026Q1": [null, 10.8136, 8.7078],
    "2026Q2": [null, 22.9377, 17.0816],
  },
  dongwonMobility: {
    "2025Q3": [4.206, 85.2735, 2634.416],
    "2025Q4": [4.7401, 11.9498, "흑자전환"], // 순이익 전년 −190,210,855 → 이번 10,598,536,367 (비율로는 +5671.9934%)
    "2026Q1": [9.5863, -60.6983, -0.2732],
    "2026Q2": [15.2713, 10.4331, 154.4937],
  },
  sewonPrecision: {
    "2025Q3": [14.3893, 116.2232, 29.4425],
    "2025Q4": [18.4974, 1.692, -24.9051],
    "2026Q1": [-21.7857, "적자전환", -37.9988], // 영업이익 전년 흑자 → 이번 적자 (비율로는 −421.034%)
    "2026Q2": [-3.5204, 38.7595, 57.7714],
  },
  leeno: {
    "2025Q3": [40.4809, 57.3603, 70.8736],
    "2025Q4": [1.6077, 9.0045, 3.3731],
    "2026Q1": [27.2425, 35.3853, 37.6603],
    "2026Q2": [27.2528, 37.5519, 60.3566],
  },
};

/** 달력 연간 2025 = 달력 2025Q1~Q4 합 (ANSWER_KEY.md §4). [매출, 영업이익, 순이익] */
const EXPECTED_CALENDAR_2025: Record<SampleKey, Triple> = {
  skHynix: ["97146675000000", "47206319000000", "42947902000000"],
  samsung: ["333605938000000", "43601051000000", "45206805000000"],
  kb: [null, "8517711000000", "5840715000000"],
  shinhan: [null, "7023357000000", "5084519000000"],
  dongwonMobility: ["643895296332", "44369056328", "39080875900"],
  sewonPrecision: ["190830995967", "21346468846", "47269225347"],
  leeno: ["372534084608", "176997188289", "151960670406"],
};

/**
 * 엔진이 손 계산과 다르게 나오는 경우 (ANSWER_KEY.md §6). 지금은 비어 있다.
 * 2026-09-30 처음 만들 때 12월 외 결산 6건(동원모빌리티·세원정공)이 1년 어긋났다 — OpenDART의 `bsns_year`는
 * 보고서 기간이 **끝난 해**인데 엔진이 "회계연도 시작 해"로 읽었다. `src/lib/financials/period.ts`의
 * `dartBsnsYear`·`fiscalYearOfReport`로 고쳐 모두 손 계산과 같아졌다. 새로 틀리는 경우가 생기면
 * 정답을 고치지 말고 여기 넣어 `it.fails`로 표시한 뒤 원인을 적는다.
 */
const KNOWN_ENGINE_BUGS = new Set<string>([]);
const isKnownBug = (key: SampleKey, quarter: string) => KNOWN_ENGINE_BUGS.has(`${key}:${quarter}`);
const itFor = (broken: boolean) => (broken ? it.fails : it);

// ---------------------------------------------------------------------------
// 엔진 실행 (한 번만)
// ---------------------------------------------------------------------------

// supabase/seed.sql의 sectors·sector_rules·sector_overrides 중 이 샘플에 필요한 행 (id = 섹터 이름)
// WU-303 섹터 규칙 보강 반영 (seed.sql·migrations/20260930190000)
const FINANCIAL_SECTORS = new Set(["은행", "증권", "보험", "금융지주", "기타금융"]);
const SECTORS = [
  "반도체",
  "디스플레이",
  "전자부품·장비",
  "2차전지",
  "자동차/부품",
  "은행",
  "증권",
  "보험",
  "제약",
  "조선",
  "금융지주",
  "기타금융",
  "기타",
].map((name) => ({ id: name, name, is_financial: FINANCIAL_SECTORS.has(name) }));
const SECTOR_RULES = [
  { induty_prefix: "261", sector_id: "반도체" },
  { induty_prefix: "2621", sector_id: "디스플레이" },
  { induty_prefix: "262", sector_id: "전자부품·장비" },
  { induty_prefix: "26", sector_id: "전자부품·장비" },
  { induty_prefix: "282", sector_id: "2차전지" },
  { induty_prefix: "21", sector_id: "제약" },
  { induty_prefix: "30", sector_id: "자동차/부품" },
  { induty_prefix: "311", sector_id: "조선" },
  { induty_prefix: "64", sector_id: "은행" },
  { induty_prefix: "641", sector_id: "은행" },
  { induty_prefix: "649", sector_id: "기타금융" },
  { induty_prefix: "64992", sector_id: "금융지주" },
  { induty_prefix: "65", sector_id: "보험" },
  { induty_prefix: "6612", sector_id: "증권" },
];
const SECTOR_OVERRIDES = [
  { corp_code: "00164779", sector_id: "반도체" }, // SK하이닉스
  { corp_code: "00688996", sector_id: "금융지주" }, // KB금융
  { corp_code: "00126380", sector_id: "반도체" }, // 삼성전자
  { corp_code: "00369657", sector_id: "반도체" }, // 리노공업
  { corp_code: "00382199", sector_id: "금융지주" }, // 신한지주
];

const db = createFakeFinancialsDb({
  account_map: ACCOUNT_MAP_SEED_ROWS,
  sectors: SECTORS,
  sector_rules: SECTOR_RULES,
  sector_overrides: SECTOR_OVERRIDES,
  companies: SAMPLE_KEYS.map((key) => ({
    corp_code: FIXTURES[key].corp_code,
    acc_mt: FIXTURES[key].acc_mt,
    sectors: { is_financial: FIXTURES[key].is_financial },
  })),
});

function companyRef(key: SampleKey): CompanyRef {
  const f = FIXTURES[key];
  return {
    corpCode: f.corp_code,
    stockCode: f.stock_code,
    name: f.corp_name,
    market: f.market as CompanyRef["market"],
    sector: { name: "", source: "other", isFinancial: f.is_financial },
    fiscalMonth: f.acc_mt,
  };
}

const financials = {} as Record<SampleKey, CompanyFinancials>;
const dartCalls: { params: Record<string, string | number | undefined>; status: string }[] = [];

beforeAll(async () => {
  dartFetchMock.mockImplementation(
    async (_path: string, params: Record<string, string | number | undefined>) => {
      const res = fakeDartResponse(params);
      dartCalls.push({ params, status: res.status });
      return res;
    },
  );
  for (const key of SAMPLE_KEYS) {
    // 최근 4개 달력 분기(2025Q3~2026Q2) + YoY용 앞 4개 분기(2024Q3~2025Q2)
    financials[key] = await ensureCompanyFinancials(companyRef(key), "2024Q3", "2026Q2", {
      client: db.client,
    });
  }
});

function valueOf(computed: Computed<bigint> | undefined): string | null | undefined {
  if (!computed) return undefined;
  return computed.value === null ? null : computed.value.toString();
}

function engineTriple(key: SampleKey, quarter: string) {
  const row = financials[key].metricsByQuarter.get(quarter as Quarter);
  return [
    valueOf(row?.metrics.revenue),
    valueOf(row?.metrics.operating_income),
    valueOf(row?.metrics.net_income),
  ];
}

// ---------------------------------------------------------------------------
// 테스트
// ---------------------------------------------------------------------------

describe("수집 경로 확인 (fixture가 엔진 요청을 빠짐없이 덮는다)", () => {
  it("리노공업만 CFS가 013이라 OFS로 대체되고, 나머지 요청은 모두 fixture에서 응답됐다(가짜 013 없음)", () => {
    const missing = dartCalls.filter((c) => c.status === "013");
    expect(missing.length).toBeGreaterThan(0);
    for (const call of missing) {
      expect(call.params.corp_code).toBe("00369657");
      expect(call.params.fs_div).toBe("CFS");
    }
    const leenoOfs = dartCalls.filter(
      (c) => c.params.corp_code === "00369657" && c.params.fs_div === "OFS",
    );
    expect(leenoOfs.length).toBe(missing.length); // CFS 013 한 번마다 OFS 한 번 (TECH §6.1)
  });

  it("fs_div: 리노공업 OFS(별도 기준), 나머지 CFS(연결 기준)", () => {
    for (const key of SAMPLE_KEYS) {
      const rows = [...financials[key].metricsByQuarter.values()];
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.fs_div).toBe(key === "leeno" ? "OFS" : "CFS");
    }
  });

  it("결산월 3·6·12월은 분기 경계 불일치가 아니다(boundary_mismatch = false)", () => {
    for (const key of SAMPLE_KEYS) {
      for (const row of financials[key].metricsByQuarter.values()) {
        expect(row.boundary_mismatch).toBe(false);
      }
    }
  });
});

describe("① 달력 분기 단독 실적 [매출, 영업이익, 순이익] = 손 계산 (TECH §6.2·§6.3)", () => {
  for (const key of SAMPLE_KEYS) {
    for (const quarter of QUARTERS) {
      const broken = isKnownBug(key, quarter);
      itFor(broken)(
        `${FIXTURES[key].corp_name} ${quarter}${broken ? " — 엔진 버그(ANSWER_KEY §6)" : ""}`,
        () => {
          expect(engineTriple(key, quarter)).toEqual(EXPECTED[key][quarter]);
        },
      );
    }
  }

  it("금융사 매출(영업수익)은 원문에 합계 행이 없어 계산 불가(MISSING_ACCOUNT)로 나온다", () => {
    for (const key of ["kb", "shinhan"] as const) {
      for (const quarter of QUARTERS) {
        const row = financials[key].metricsByQuarter.get(quarter);
        expect(row?.metrics.revenue).toEqual({ value: null, reason: "MISSING_ACCOUNT" });
      }
    }
  });
});

const METRIC_ORDER = ["revenue", "operating_income", "net_income"] as const;

function engineYoy(key: SampleKey, metric: (typeof METRIC_ORDER)[number], quarter: Quarter) {
  const allocator = createFigureAllocator();
  const { series } = buildQuarterlySeries(
    financials[key],
    "CFS",
    [quarter],
    [metric, "yoy"],
    allocator,
  );
  const yoySeries = series.find((s) => s.key === "yoy")!;
  return allocator.figures[yoySeries.points[0].figureId];
}

describe("② YoY % = 손 계산 (TECH §6.4, 최근 4개 분기)", () => {
  for (const key of SAMPLE_KEYS) {
    for (const quarter of LATEST_FOUR) {
      // 이번 분기나 전년 같은 분기 중 하나라도 엔진 값이 틀리면 YoY도 틀린다
      const [y, q] = quarter.split("Q");
      const broken = isKnownBug(key, quarter) || isKnownBug(key, `${Number(y) - 1}Q${q}`);
      itFor(broken)(
        `${FIXTURES[key].corp_name} ${quarter} YoY${broken ? " — 엔진 버그(ANSWER_KEY §6)" : ""}`,
        () => {
          METRIC_ORDER.forEach((metric, i) => {
            const expected = EXPECTED_YOY[key][quarter][i];
            const figure = engineYoy(key, metric, quarter);
            if (expected === null) {
              expect(figure.value).toBeNull();
              expect(figure.reason).toBe("MISSING_ACCOUNT");
            } else if (typeof expected === "string") {
              expect(figure.value).toBeNull();
              expect(figure.reason).toBeUndefined();
              expect(figure.display).toBe(expected);
            } else {
              expect(figure.value).not.toBeNull();
              expect(figure.value!).toBeCloseTo(expected, 3);
            }
          });
        },
      );
    }
  }

  // TECH §6.4: 부호가 바뀐 경우 비율 대신 글자로 표시한다 (2026-09-30 구현)
  it("부호 변경 표시: 동원모빌리티 2025Q4 순이익 YoY는 '흑자전환'으로 표시된다", () => {
    const figure = engineYoy("dongwonMobility", "net_income", "2025Q4");
    expect(figure.display).toBe("흑자전환");
  });
});

describe("③ 달력 연간 2025 = 달력 1Q~4Q 합 (TECH §6.3)", () => {
  const quarters2025: Quarter[] = ["2025Q1", "2025Q2", "2025Q3", "2025Q4"];
  for (const key of SAMPLE_KEYS) {
    const broken = quarters2025.some((q) => isKnownBug(key, q));
    itFor(broken)(
      `${FIXTURES[key].corp_name} 2025년${broken ? " — 엔진 버그(ANSWER_KEY §6)" : ""}`,
      () => {
        const allocator = createFigureAllocator();
        const { series } = buildAnnualSeries(
          financials[key],
          "CFS",
          quarters2025,
          [...METRIC_ORDER],
          allocator,
        );
        const actual = METRIC_ORDER.map((metric) => {
          const s = series.find((x) => x.key === metric)!;
          expect(s.points.map((p) => p.x)).toEqual(["2025"]);
          const figure = allocator.figures[s.points[0].figureId];
          return figure.value === null ? null : String(figure.value);
        });
        expect(actual).toEqual(EXPECTED_CALENDAR_2025[key]);
      },
    );
  }
});

// ---------------------------------------------------------------------------
// WU-199 기본 질문: 전체 매출(합계)·섹터별 합계·분기별 추이
// 엔진에는 여러 기업 값을 더하는 함수가 없다(groupBy "sector"도 나란히 놓기만 한다, ANSWER_KEY §6).
// 그래서 합계는 엔진이 낸 기업별 값을 여기서 더하고, 그 결과를 손 계산 합계와 비교한다.
// ---------------------------------------------------------------------------

function engineRevenue(key: SampleKey, quarter: Quarter): bigint {
  const value = financials[key].metricsByQuarter.get(quarter)?.metrics.revenue.value;
  if (value == null) throw new Error(`${key} ${quarter} 매출 없음`);
  return value;
}

/** 전체 매출 합계 (비금융 5곳, ANSWER_KEY §5.1) */
const EXPECTED_TOTAL_REVENUE: Record<string, string> = {
  "2025Q3": "110802287080740",
  "2025Q4": "126947854108111",
  "2026Q1": "186766703306755",
  "2026Q2": "251213562656206",
};

/** 섹터 분류 (TECH §8 순서를 seed 규칙에 손으로 적용, ANSWER_KEY §5.2 — WU-303 보강 뒤) */
const EXPECTED_SECTOR: Record<SampleKey, string> = {
  skHynix: "반도체", // 수동 지정
  samsung: "반도체", // 수동 지정 (업종코드 264만으로는 "26" → 전자부품·장비)
  kb: "금융지주", // 수동 지정
  shinhan: "금융지주", // 수동 지정 (업종코드 64992 → "64992" 규칙으로도 금융지주)
  dongwonMobility: "자동차/부품", // 업종코드 303 → "30"
  sewonPrecision: "자동차/부품", // 업종코드 303 → "30"
  leeno: "반도체", // 수동 지정 (업종코드 2629만으로는 "262" → 전자부품·장비)
};

/** 섹터별 매출 합계 (비금융, ANSWER_KEY §5.3) */
const EXPECTED_SECTOR_REVENUE: Record<string, Record<string, string>> = {
  "2025Q4": {
    반도체: "126748783949290", // SK하이닉스 + 삼성전자 + 리노공업
    "자동차/부품": "199070158821",
  },
  "2026Q2": {
    반도체: "250961403426964",
    "자동차/부품": "252159229242",
  },
};

describe("④ WU-199 기본 질문 — 전체 매출(합계)", () => {
  for (const quarter of LATEST_FOUR) {
    const broken = NON_FINANCIAL.some((key) => isKnownBug(key, quarter));
    itFor(broken)(
      `비금융 5곳 매출 합계 ${quarter}${broken ? " — 엔진 버그(ANSWER_KEY §6)" : ""}`,
      () => {
        const total = NON_FINANCIAL.reduce(
          (sum, key) => sum + engineRevenue(key, quarter),
          BigInt(0),
        );
        expect(total.toString()).toBe(EXPECTED_TOTAL_REVENUE[quarter]);
      },
    );
  }
});

describe("④ WU-199 기본 질문 — 섹터별 합계", () => {
  it("샘플 7곳의 섹터 분류가 손으로 적용한 TECH §8 규칙과 같다", async () => {
    for (const key of SAMPLE_KEYS) {
      const result = await classifySector(
        db.client,
        FIXTURES[key].corp_code,
        FIXTURES[key].induty_code,
      );
      expect(result.sectorId, FIXTURES[key].corp_name).toBe(EXPECTED_SECTOR[key]);
    }
  });

  for (const [quarter, bySector] of Object.entries(EXPECTED_SECTOR_REVENUE)) {
    for (const [sector, expected] of Object.entries(bySector)) {
      const members = NON_FINANCIAL.filter((key) => EXPECTED_SECTOR[key] === sector);
      const broken = members.some((key) => isKnownBug(key, quarter));
      itFor(broken)(
        `${quarter} ${sector} 매출 합계${broken ? " — 엔진 버그(ANSWER_KEY §6)" : ""}`,
        async () => {
          let total = BigInt(0);
          for (const key of NON_FINANCIAL) {
            const { sectorId } = await classifySector(
              db.client,
              FIXTURES[key].corp_code,
              FIXTURES[key].induty_code,
            );
            if (sectorId === sector) total += engineRevenue(key, quarter as Quarter);
          }
          expect(total.toString()).toBe(expected);
        },
      );
    }
  }
});

describe("④ WU-199 기본 질문 — 분기별 추이 (buildQuarterlySeries, 2025Q3→2026Q2)", () => {
  for (const key of SAMPLE_KEYS) {
    const broken = LATEST_FOUR.some((q) => isKnownBug(key, q));
    // 금융사는 매출이 없으므로 영업이익 추이를 본다
    const metric = FIXTURES[key].is_financial ? "operating_income" : "revenue";
    const index = FIXTURES[key].is_financial ? 1 : 0;
    itFor(broken)(
      `${FIXTURES[key].corp_name} ${metric === "revenue" ? "매출" : "영업이익"} 추이${broken ? " — 엔진 버그(ANSWER_KEY §6)" : ""}`,
      () => {
        const allocator = createFigureAllocator();
        const { series } = buildQuarterlySeries(
          financials[key],
          "CFS",
          LATEST_FOUR,
          [metric],
          allocator,
        );
        const points = series[0].points;
        expect(points.map((p) => p.x)).toEqual(LATEST_FOUR);
        const values = points.map((p) => {
          const v = allocator.figures[p.figureId].value;
          return v === null ? null : String(v);
        });
        expect(values).toEqual(LATEST_FOUR.map((q) => EXPECTED[key][q][index]));
      },
    );
  }
});

// ---------------------------------------------------------------------------
// ⑤ 엔진의 합계 기능 (buildSumSeries, PRD F-N3) = 손 계산
// 위 ④는 기업별 엔진 값을 테스트에서 더했다. 여기서는 서비스가 실제로 쓰는 합계 함수가 같은 답을 내는지 본다.
// ---------------------------------------------------------------------------

function sample(key: SampleKey, sectorName = "") {
  const ref = companyRef(key);
  return {
    company: { ...ref, sector: { ...ref.sector, name: sectorName } },
    financials: financials[key],
    fsDiv: (key === "leeno" ? "OFS" : "CFS") as "CFS" | "OFS", // 리노공업만 별도 기준 (위 fs_div 테스트)
  };
}

function sumFigures(
  series: ReturnType<typeof buildSumSeries>,
  allocator: ReturnType<typeof createFigureAllocator>,
) {
  return new Map(
    series.series.map((s) => [
      s.key,
      new Map(s.points.map((p) => [p.x, allocator.figures[p.figureId]])),
    ]),
  );
}

describe("⑤ 엔진 합계 기능 — 전체 매출(합계)·섹터별 합계 (WU-199 1번 조건)", () => {
  it("비금융 5곳 매출 합계: 4개 분기 모두 손 계산과 같다", () => {
    const allocator = createFigureAllocator();
    const result = buildSumSeries(
      NON_FINANCIAL.map((key) => sample(key)),
      sumPeriods(LATEST_FOUR, false),
      ["revenue"],
      false,
      allocator,
    );
    const byQuarter = sumFigures(result, allocator).get("revenue_sum")!;
    for (const quarter of LATEST_FOUR) {
      expect(String(BigInt(Math.round(byQuarter.get(quarter)!.value!))), quarter).toBe(
        EXPECTED_TOTAL_REVENUE[quarter],
      );
    }
    expect(result.excluded).toEqual([]);
  });

  it("금융사를 섞으면 매출이 없는 금융사는 빼고 더하고, 뺀 사실을 알린다 (0으로 치지 않는다)", () => {
    const allocator = createFigureAllocator();
    const result = buildSumSeries(
      [...NON_FINANCIAL, "kb" as SampleKey].map((key) => sample(key)),
      sumPeriods(["2026Q2"], false),
      ["revenue"],
      false,
      allocator,
    );
    const figure = sumFigures(result, allocator).get("revenue_sum")!.get("2026Q2")!;
    expect(String(BigInt(Math.round(figure.value!)))).toBe(EXPECTED_TOTAL_REVENUE["2026Q2"]);
    expect(result.excluded).toEqual(["KB금융 매출"]);
  });

  for (const [quarter, bySector] of Object.entries(EXPECTED_SECTOR_REVENUE)) {
    it(`${quarter} 섹터별 매출 합계가 손 계산과 같다`, () => {
      const allocator = createFigureAllocator();
      const result = buildSumSeries(
        NON_FINANCIAL.map((key) => sample(key, EXPECTED_SECTOR[key])),
        sumPeriods([quarter as Quarter], false),
        ["revenue"],
        true,
        allocator,
      );
      const figures = sumFigures(result, allocator);
      for (const [sector, expected] of Object.entries(bySector)) {
        const figure = figures.get(`revenue:${sector}`)!.get(quarter)!;
        expect(String(BigInt(Math.round(figure.value!))), sector).toBe(expected);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// ⑥ WU-303 기업 비교 — 금융업 공통 지표 (TECH §7, ANSWER_KEY §8.2)
// 금융사 영업이익률 = 영업이익 ÷ 영업수익. KB금융·신한지주 원문에는 영업수익 합계 행이 없어 계산 불가.
// ---------------------------------------------------------------------------

describe("⑥ WU-303 기업 비교 — 금융업 공통 지표 (2026Q2)", () => {
  function compareAt(keys: SampleKey[]) {
    const allocator = createFigureAllocator();
    const result = buildCompanyComparisonSeries(
      keys.map((key) => sample(key, EXPECTED_SECTOR[key])), // 금융업 여부는 fixture의 is_financial
      "2026Q2",
      ["operating_margin"],
      allocator,
    );
    const figures = result.series[0].points.map((p) => allocator.figures[p.figureId]);
    return { result, figures };
  }

  it("영업이익률: SK하이닉스·삼성전자는 영업이익 ÷ 매출 = 손 계산", () => {
    const { figures } = compareAt(["skHynix", "samsung"]);
    // 60,542,608,000,000 ÷ 79,318,746,000,000 × 100 · 89,492,412,000,000 ÷ 171,499,470,000,000 × 100
    expect(figures[0].value).toBeCloseTo(76.3282465408619, 9);
    expect(figures[1].value).toBeCloseTo(52.1823256946508, 9);
  });

  it("KB금융 영업이익률은 영업이익 ÷ 영업수익 — 영업수익 행이 없어 계산 불가(MISSING_ACCOUNT)이고, 라벨에 식이 보인다", () => {
    const { figures, result } = compareAt(["skHynix", "kb", "shinhan"]);
    expect(figures[1].label).toBe("KB금융 영업이익률(영업이익÷영업수익) 2026Q2");
    expect(figures[1]).toMatchObject({
      value: null,
      reason: "MISSING_ACCOUNT",
      display: "계산 불가",
    });
    expect(figures[2]).toMatchObject({ value: null, reason: "MISSING_ACCOUNT" });
    expect(figures[0].label).toBe("SK하이닉스 영업이익률 2026Q2");
    expect(result.hasFinancial).toBe(true);
    // 안정성 지표를 묻지 않았으니 ※·그래프 전환은 없다
    expect(result.financialFootnote).toBe(false);
    expect(result.stabilitySwitched).toBe(false);
  });
});
