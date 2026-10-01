// WU-203: 계산 전에 전처리 진단 5종(TECH §9)에 필요한 사실을 모은다 — 결측·정정 중복·연결/별도 혼재·
// 결산월·분기 경계. 진단 카드 모양은 src/lib/preprocess/diagnose.ts가 만든다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyRef, Diagnosis, MetricId, Quarter } from "@/contracts";
import { reportsNeededForFiscalQuarters } from "@/lib/financials/period";
import type { CalendarQuarterMetrics } from "@/lib/metrics/persist";
import { buildDiagnoses, type DiagnosisFacts } from "@/lib/preprocess/diagnose";
import type { DataSource } from "@/lib/versions/version";
import { financialsFromSources, sourceKeyOf, type CompanyFinancials } from "./company-financials";

type BaseField = keyof CalendarQuarterMetrics;

/** 요청 지표 → 계산에 들어가는 원본 계정 (이 계정이 비면 그 지표도 빈다) */
const BASE_FIELDS: Record<MetricId, BaseField[]> = {
  revenue: ["revenue"],
  operating_income: ["operating_income"],
  net_income: ["net_income"],
  operating_margin: ["operating_income", "revenue"],
  net_margin: ["net_income", "revenue"],
  yoy: [],
  qoq: [],
  ttm_owners_ni: ["owners_net_income"],
  roe: ["owners_net_income", "owners_equity"],
  debt_ratio: ["liabilities", "equity"],
  equity_ratio: ["equity", "assets"],
  market_cap: [],
  per: [],
  pbr: [],
};

const FIELD_LABEL: Partial<Record<BaseField, string>> = {
  revenue: "매출",
  operating_income: "영업이익",
  net_income: "당기순이익",
  owners_net_income: "지배주주순이익",
  owners_equity: "지배주주지분",
  liabilities: "부채",
  equity: "자본",
  assets: "자산",
};

const SUM_PRIORITY = ["revenue", "operating_income", "net_income"] as const;

/** 미리보기 합계에 쓰는 대표 지표 — 증감률 기준(series-builders)과 같은 우선순위 */
export function primarySumField(metrics: readonly MetricId[]): BaseField | null {
  const fields = new Set(metrics.flatMap((m) => BASE_FIELDS[m] ?? []));
  if (metrics.includes("yoy") || metrics.includes("qoq")) fields.add("revenue");
  return SUM_PRIORITY.find((f) => fields.has(f)) ?? null;
}

function baseFields(metrics: readonly MetricId[]): BaseField[] {
  const fields = new Set(metrics.flatMap((m) => BASE_FIELDS[m] ?? []));
  if (metrics.includes("yoy") || metrics.includes("qoq")) {
    fields.add(primarySumField(metrics.filter((m) => m !== "yoy" && m !== "qoq")) ?? "revenue");
  }
  return [...fields];
}

function valueAt(financials: CompanyFinancials, quarter: Quarter, field: BaseField) {
  return financials.metricsByQuarter.get(quarter)?.metrics[field];
}

/**
 * 계정 값 결측(TECH §9 `MISSING_ACCOUNT`) 행: 보고서는 있는데 계정 값이 빈 분기.
 * 그 계정이 요청 기간 **어느 분기에도 없으면** 결측이 아니라 원래 없는 계정(예: 은행의 매출)이라 뺀다 —
 * 그런 계정을 "분기 제외"하면 표가 통째로 사라진다.
 */
export function findMissingQuarters(
  financials: CompanyFinancials,
  quarters: readonly Quarter[],
  metrics: readonly MetricId[],
): { quarters: Quarter[]; fields: BaseField[] } {
  const withReport = quarters.filter((q) => !financials.quartersWithoutReport?.has(q));
  const missingQuarters = new Set<Quarter>();
  const missingFields = new Set<BaseField>();
  for (const field of baseFields(metrics)) {
    const present = withReport.filter((q) => valueAt(financials, q, field)?.value != null);
    if (present.length === 0) continue;
    for (const q of withReport) {
      const computed = valueAt(financials, q, field);
      // 계정 값 자체가 빈 경우만 — 직전 누적이 없어 계산 못 한 것(NO_PREV_PERIOD) 등은 결측이 아니다
      if (!computed || (computed.value == null && computed.reason === "MISSING_ACCOUNT")) {
        missingQuarters.add(q);
        missingFields.add(field);
      }
    }
  }
  return {
    quarters: quarters.filter((q) => missingQuarters.has(q)),
    fields: [...missingFields],
  };
}

function sumField(
  financials: CompanyFinancials,
  quarters: readonly Quarter[],
  field: BaseField | null,
): number | null {
  if (!field) return null;
  let sum = 0;
  for (const q of quarters) {
    const v = valueAt(financials, q, field)?.value;
    if (typeof v === "bigint") sum += Number(v);
    else if (typeof v === "number") sum += v;
  }
  return sum;
}

/** 이 달력 분기 값을 만드는 데 쓰인 보고서 키("연도-보고서코드") */
function reportKeysOf(financials: CompanyFinancials, quarter: Quarter, accMt: number): string[] {
  const ref = financials.fiscalRefByQuarter.get(quarter);
  if (!ref) return [];
  return reportsNeededForFiscalQuarters([ref], accMt).map((r) => `${r.bsnsYear}-${r.reprtCode}`);
}

export interface CompanySample {
  company: CompanyRef;
  financials: CompanyFinancials;
}

/** 같은 보고서에 접수번호가 둘 이상(최초 공시 + 정정본)인 출처 → 최초 공시 접수번호 */
export async function findFirstFilings(
  client: SupabaseClient,
  sources: readonly DataSource[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const corpCodes = [...new Set(sources.filter((s) => s.rceptNo).map((s) => s.corpCode))];
  for (const corpCode of corpCodes) {
    const years = [
      ...new Set(sources.filter((s) => s.corpCode === corpCode).map((s) => s.bsnsYear)),
    ];
    const { data, error } = await client
      .from("report_values")
      .select("bsns_year, reprt_code, fs_div, source_rcept_no")
      .eq("corp_code", corpCode)
      .in("bsns_year", years);
    if (error) throw new Error(`report_values 조회 실패: ${error.message}`);
    const filings = new Map<string, Set<string>>();
    for (const row of (data ?? []) as {
      bsns_year: number;
      reprt_code: string;
      fs_div: string;
      source_rcept_no: string;
    }[]) {
      const key = `${corpCode}|${row.bsns_year}|${row.reprt_code}|${row.fs_div}`;
      if (!filings.has(key)) filings.set(key, new Set());
      filings.get(key)!.add(row.source_rcept_no);
    }
    for (const s of sources) {
      if (s.corpCode !== corpCode || !s.rceptNo || !s.fsDiv) continue;
      const set = filings.get(`${corpCode}|${s.bsnsYear}|${s.reprtCode}|${s.fsDiv}`);
      if (!set || set.size < 2) continue;
      // 접수번호는 접수일(YYYYMMDD)로 시작해 가장 작은 것이 최초 공시다
      const first = [...set].sort()[0];
      if (first !== s.rceptNo) result.set(sourceKeyOf(s), first);
    }
  }
  return result;
}

/** 출처 중 정정 중복 보고서를 최초 공시로 바꾼 목록 (`collected`에 원래 최신 값) */
export function applyFirstFilings(
  sources: readonly DataSource[],
  firstFilings: ReadonlyMap<string, string>,
): DataSource[] {
  return sources.map((s) => {
    const first = firstFilings.get(sourceKeyOf(s));
    if (!first || !s.fsDiv || !s.rceptNo) return s;
    return { ...s, rceptNo: first, collected: { fsDiv: s.fsDiv, rceptNo: s.rceptNo } };
  });
}

/** 연결(CFS)·별도(OFS)가 섞인 기업 */
export function mixedFsDivCorps(sources: readonly DataSource[]): Set<string> {
  const divs = new Map<string, Set<string>>();
  for (const s of sources) {
    if (!s.fsDiv) continue;
    if (!divs.has(s.corpCode)) divs.set(s.corpCode, new Set());
    divs.get(s.corpCode)!.add(s.fsDiv);
  }
  return new Set([...divs].filter(([, set]) => set.size > 1).map(([corp]) => corp));
}

export interface DiagnosticsResult {
  diagnoses: Diagnosis[];
  /** 정정 중복 보고서 → 최초 공시 접수번호 */
  firstFilings: Map<string, string>;
  /** 연결·별도가 섞인 기업 */
  mixedCorps: Set<string>;
}

/** 진단 5종을 모은다. 정정 중복 미리보기용으로 최초 공시 기준 값을 한 번 더 계산한다(DB만, 외부 호출 없음) */
export async function collectDiagnostics(
  samples: readonly CompanySample[],
  quarters: readonly Quarter[],
  metrics: readonly MetricId[],
  client: SupabaseClient,
): Promise<DiagnosticsResult> {
  const totalRows = samples.length * quarters.length;
  const sumFieldId = primarySumField(metrics);
  const facts: DiagnosisFacts = { totalRows };
  const allSources = samples.flatMap((s) => s.financials.sources ?? []);

  // ① 계정 값 결측
  let missingRows = 0;
  let sum = 0;
  let sumExcluded = 0;
  const missingNotes: string[] = [];
  for (const { company, financials } of samples) {
    const missing = findMissingQuarters(financials, quarters, metrics);
    missingRows += missing.quarters.length;
    sum += sumField(financials, quarters, sumFieldId) ?? 0;
    const kept = quarters.filter((q) => !missing.quarters.includes(q));
    sumExcluded += sumField(financials, kept, sumFieldId) ?? 0;
    if (missing.quarters.length > 0) {
      const labels = missing.fields.map((f) => FIELD_LABEL[f] ?? f).join("·");
      missingNotes.push(`${company.name} ${missing.quarters.join(", ")} ${labels} 값 없음`);
    }
  }
  if (missingRows > 0) {
    facts.missing = {
      affectedRows: missingRows,
      description: missingNotes.join(" / "),
      sum: sumFieldId ? sum : null,
      sumExcluded: sumFieldId ? sumExcluded : null,
    };
  }

  // ② 정정 공시 중복
  const firstFilings = await findFirstFilings(client, allSources);
  if (firstFilings.size > 0 && quarters.length > 0) {
    let affected = 0;
    let sumLatest = 0;
    let sumFirst = 0;
    let sumBoth = 0;
    const notes: string[] = [];
    for (const { company, financials } of samples) {
      const dupKeys = new Set(
        [...firstFilings.keys()]
          .filter((k) => k.startsWith(`${company.corpCode}|`))
          .map((k) => k.split("|").slice(1).join("-")),
      );
      const latestSum = sumField(financials, quarters, sumFieldId) ?? 0;
      sumLatest += latestSum;
      if (dupKeys.size === 0) {
        sumFirst += latestSum;
        sumBoth += latestSum;
        continue;
      }
      const affectedQuarters = quarters.filter((q) =>
        reportKeysOf(financials, q, company.fiscalMonth).some((k) => dupKeys.has(k)),
      );
      affected += affectedQuarters.length;
      const firstFinancials = await financialsFromSources(
        company,
        quarters[0],
        quarters[quarters.length - 1],
        applyFirstFilings(financials.sources ?? [], firstFilings),
        { client },
      );
      sumFirst += sumField(firstFinancials, quarters, sumFieldId) ?? 0;
      sumBoth += latestSum + (sumField(firstFinancials, affectedQuarters, sumFieldId) ?? 0);
      if (affectedQuarters.length > 0) {
        notes.push(`${company.name} ${affectedQuarters.join(", ")} 정정 공시로 값이 두 벌 있음`);
      }
    }
    if (affected > 0) {
      facts.duplicate = {
        affectedRows: affected,
        description: notes.join(" / "),
        sumBoth: sumFieldId ? sumBoth : null,
        sumLatest: sumFieldId ? sumLatest : null,
        sumFirst: sumFieldId ? sumFirst : null,
      };
    }
  }

  // ③ 연결·별도 혼재
  const mixedCorps = mixedFsDivCorps(allSources);
  if (mixedCorps.size > 0) {
    let affected = 0;
    const notes: string[] = [];
    for (const { company, financials } of samples) {
      if (!mixedCorps.has(company.corpCode)) continue;
      const cfsKeys = new Set(
        (financials.sources ?? [])
          .filter((s) => s.fsDiv === "CFS")
          .map((s) => `${s.bsnsYear}-${s.reprtCode}`),
      );
      const cfsQuarters = quarters.filter((q) =>
        reportKeysOf(financials, q, company.fiscalMonth).some((k) => cfsKeys.has(k)),
      );
      affected += cfsQuarters.length;
      notes.push(`${company.name}: 기간 안에 연결·별도 재무제표가 섞여 있음`);
    }
    if (affected > 0) facts.mixed = { affectedRows: affected, description: notes.join(" / ") };
  }

  // ④ 결산월 차이 · ⑤ 분기 경계 불일치 (규칙대로 자동 처리, 표시만)
  const nonDecember = samples.filter((s) => s.company.fiscalMonth !== 12);
  if (nonDecember.length > 0) {
    facts.fiscalMonth = {
      description: nonDecember
        .map((s) => `${s.company.name} ${s.company.fiscalMonth}월 결산 — 달력 분기로 환산`)
        .join(" / "),
    };
  }
  const offBoundary = samples.filter((s) => ![3, 6, 9, 12].includes(s.company.fiscalMonth));
  if (offBoundary.length > 0) {
    facts.boundaryMismatch = {
      description: offBoundary
        .map(
          (s) =>
            `${s.company.name} ${s.company.fiscalMonth}월 결산 — 분기가 달력 분기와 어긋나 종료월 기준으로 배정`,
        )
        .join(" / "),
    };
  }

  return { diagnoses: buildDiagnoses(facts), firstFilings, mixedCorps };
}

/** 결과 주석(사용된 데이터)에 붙일 전처리 표시 */
export function preprocessFlags(
  decisions: Partial<Record<Diagnosis["kind"], string>>,
  excluded: readonly string[],
): string[] {
  const flags: string[] = [];
  if (decisions.missing_account === "exclude_quarter" && excluded.length > 0) {
    flags.push(`계정 값이 빈 분기 제외: ${excluded.join(", ")}`);
  }
  if (decisions.missing_account === "show_blank") flags.push("계정 값이 빈 분기는 빈칸으로 표시");
  if (decisions.duplicate_correction === "first_filing") flags.push("정정 공시: 최초 공시 값 사용");
  if (decisions.duplicate_correction === "latest_correction")
    flags.push("정정 공시: 최신 정정본 사용");
  if (decisions.mixed_fs_div === "unify_ofs") flags.push("연결·별도 혼재 → 별도(OFS)로 통일");
  if (decisions.mixed_fs_div === "keep_mixed") flags.push("⚠ 연결·별도 재무제표가 섞여 있음");
  if (decisions.boundary_mismatch) flags.push("분기 경계 불일치 — 종료월 기준으로 분기 배정");
  return flags;
}
