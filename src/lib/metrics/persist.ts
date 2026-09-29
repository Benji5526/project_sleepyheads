import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAccountMap } from "@/lib/financials/account-map";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { FsDiv, ReprtCode, StandardMetric } from "@/lib/financials/types";
import { mapFiscalQuarterToCalendar } from "./calendar-quarter";
import { balanceSheetQuarterValue, flowQuarterValue, type ReportAmounts } from "./fiscal-quarter";
import {
  debtRatio,
  equityRatio,
  netMargin,
  operatingMargin,
  roe,
  ttmOwnersNetIncome,
} from "./formulas";
import {
  CALC_VERSION,
  type Computed,
  type ComputedWithFootnote,
  type FiscalQuarter,
} from "./types";

const STOCK_METRICS = new Set<StandardMetric>(["assets", "liabilities", "equity", "owners_equity"]);

export interface CalendarQuarterMetrics {
  revenue: Computed<bigint>;
  operating_income: Computed<bigint>;
  net_income: Computed<bigint>;
  owners_net_income: Computed<bigint>;
  assets: Computed<bigint>;
  liabilities: Computed<bigint>;
  equity: Computed<bigint>;
  owners_equity: Computed<bigint>;
  operating_margin: Computed<number>;
  net_margin: Computed<number>;
  equity_ratio: Computed<number>;
  debt_ratio: ComputedWithFootnote<number>;
  ttm_owners_ni: Computed<bigint>;
  roe: Computed<number>;
}

export interface CalendarQuarterMetricsRow {
  corp_code: string;
  cal_year: number;
  cal_quarter: 1 | 2 | 3 | 4;
  fs_div: FsDiv;
  metrics: CalendarQuarterMetrics;
  boundary_mismatch: boolean;
  calc_version: typeof CALC_VERSION;
}

export interface ComputeCalendarQuarterMetricsOptions {
  /** 테스트에서 가짜 Supabase 클라이언트를 주입할 때만 쓴다. */
  client?: SupabaseClient;
}

interface ReportValueDbRow {
  bsns_year: number;
  reprt_code: ReprtCode;
  fs_div: FsDiv;
  account_id: string;
  amount_3m: string | null;
  amount_cum: string | null;
}

type ReportsByYearAndCode = Map<
  number,
  Partial<Record<ReprtCode, Partial<Record<StandardMetric, ReportAmounts>>>>
>;

/**
 * `report_values`(WU-105 원본)를 읽어 분기 단독·달력 환산·지표(TECH §6.2~6.4)를 계산한다.
 * DB에서 읽어오는 부분만 빼면 나머지는 전부 `fiscal-quarter.ts`·`calendar-quarter.ts`·
 * `formulas.ts`의 순수 함수 조합이다 — 저장은 하지 않는다({@link saveCalendarQuarterMetrics} 참고).
 */
export async function computeCalendarQuarterMetrics(
  corpCode: string,
  options: ComputeCalendarQuarterMetricsOptions = {},
): Promise<CalendarQuarterMetricsRow[]> {
  const admin = options.client ?? getSupabaseAdmin();

  const [reportRows, accountMap, company] = await Promise.all([
    loadReportValues(admin, corpCode),
    loadAccountMap(admin),
    loadCompany(admin, corpCode),
  ]);

  if (reportRows.length === 0) return [];

  const accountIdToMetric = new Map(
    accountMap.map((row) => [row.account_id, row.metric as StandardMetric]),
  );
  const fsDiv = reportRows[0].fs_div;
  const byYear = groupByYearReportMetric(reportRows, accountIdToMetric);

  const byCalendarQuarter = new Map<
    string,
    {
      calYear: number;
      calQuarter: 1 | 2 | 3 | 4;
      boundaryMismatch: boolean;
      metrics: Partial<Record<StandardMetric, Computed<bigint>>>;
    }
  >();

  const sortedYears = [...byYear.keys()].sort((a, b) => a - b);
  for (const bsnsYear of sortedYears) {
    const reportsForYear = byYear.get(bsnsYear)!;
    for (const quarter of [1, 2, 3, 4] as FiscalQuarter[]) {
      const calendarRef = mapFiscalQuarterToCalendar(bsnsYear, quarter, company.accMt);
      const key = `${calendarRef.calYear}Q${calendarRef.calQuarter}`;
      const existing = byCalendarQuarter.get(key) ?? {
        ...calendarRef,
        metrics: {},
      };

      for (const metric of ALL_METRICS_USED(reportsForYear)) {
        const reportsByCode: Partial<Record<ReprtCode, ReportAmounts>> = {};
        for (const [code, byMetric] of Object.entries(reportsForYear) as [
          ReprtCode,
          Partial<Record<StandardMetric, ReportAmounts>>,
        ][]) {
          const amounts = byMetric[metric];
          if (amounts) reportsByCode[code] = amounts;
        }
        const value = STOCK_METRICS.has(metric)
          ? balanceSheetQuarterValue(quarter, reportsByCode)
          : flowQuarterValue(quarter, reportsByCode);
        existing.metrics[metric] = value;
      }

      byCalendarQuarter.set(key, existing);
    }
  }

  const sortedKeys = [...byCalendarQuarter.keys()].sort(
    (a, b) =>
      quarterSortValue(byCalendarQuarter.get(a)!) - quarterSortValue(byCalendarQuarter.get(b)!),
  );

  const rows: CalendarQuarterMetricsRow[] = [];
  for (let i = 0; i < sortedKeys.length; i += 1) {
    const entry = byCalendarQuarter.get(sortedKeys[i])!;
    const m = entry.metrics;
    const get = (metric: StandardMetric): Computed<bigint> =>
      m[metric] ?? { value: null, reason: "MISSING_ACCOUNT" };

    const last4 = sortedKeys
      .slice(Math.max(0, i - 3), i + 1)
      .map((k) => byCalendarQuarter.get(k)!.metrics.owners_net_income);
    const ttm = ttmOwnersNetIncome(last4);

    const fourQuartersAgoIdx = i - 4;
    const ownersEquityFourQuartersAgo =
      fourQuartersAgoIdx >= 0
        ? byCalendarQuarter.get(sortedKeys[fourQuartersAgoIdx])!.metrics.owners_equity
        : undefined;

    rows.push({
      corp_code: corpCode,
      cal_year: entry.calYear,
      cal_quarter: entry.calQuarter,
      fs_div: fsDiv,
      boundary_mismatch: entry.boundaryMismatch,
      calc_version: CALC_VERSION,
      metrics: {
        revenue: get("revenue"),
        operating_income: get("operating_income"),
        net_income: get("net_income"),
        owners_net_income: get("owners_net_income"),
        assets: get("assets"),
        liabilities: get("liabilities"),
        equity: get("equity"),
        owners_equity: get("owners_equity"),
        operating_margin: operatingMargin(get("operating_income"), get("revenue")),
        net_margin: netMargin(get("net_income"), get("revenue")),
        equity_ratio: equityRatio(get("equity"), get("assets")),
        debt_ratio: debtRatio(get("liabilities"), get("equity"), company.isFinancial),
        ttm_owners_ni: ttm,
        roe: roe(ttm, get("owners_equity"), ownersEquityFourQuartersAgo),
      },
    });
  }

  return rows;
}

function ALL_METRICS_USED(
  reportsForYear: Partial<Record<ReprtCode, Partial<Record<StandardMetric, ReportAmounts>>>>,
): StandardMetric[] {
  const metrics = new Set<StandardMetric>();
  for (const byMetric of Object.values(reportsForYear)) {
    for (const metric of Object.keys(byMetric ?? {})) metrics.add(metric as StandardMetric);
  }
  return [...metrics];
}

function quarterSortValue(entry: { calYear: number; calQuarter: number }): number {
  return entry.calYear * 4 + entry.calQuarter;
}

export type SaveCalendarQuarterMetricsOptions = ComputeCalendarQuarterMetricsOptions;

/** {@link computeCalendarQuarterMetrics}로 계산한 결과를 `calendar_quarter_metrics`에 upsert한다. */
export async function saveCalendarQuarterMetrics(
  corpCode: string,
  options: SaveCalendarQuarterMetricsOptions = {},
): Promise<{ savedCount: number }> {
  const admin = options.client ?? getSupabaseAdmin();
  const rows = await computeCalendarQuarterMetrics(corpCode, options);
  if (rows.length === 0) return { savedCount: 0 };

  const { error } = await admin.from("calendar_quarter_metrics").upsert(
    rows.map((row) => ({
      corp_code: row.corp_code,
      cal_year: row.cal_year,
      cal_quarter: row.cal_quarter,
      fs_div: row.fs_div,
      metrics: row.metrics,
      boundary_mismatch: row.boundary_mismatch,
      calc_version: row.calc_version,
    })),
    { onConflict: "corp_code,cal_year,cal_quarter,fs_div,calc_version" },
  );
  if (error) throw new Error(`calendar_quarter_metrics 저장 실패: ${error.message}`);

  return { savedCount: rows.length };
}

async function loadReportValues(
  admin: SupabaseClient,
  corpCode: string,
): Promise<ReportValueDbRow[]> {
  const { data, error } = await admin
    .from("report_values")
    .select("bsns_year, reprt_code, fs_div, account_id, amount_3m, amount_cum")
    .eq("corp_code", corpCode)
    .is("superseded_by", null);
  if (error) throw new Error(`report_values 조회 실패: ${error.message}`);
  return (data ?? []) as unknown as ReportValueDbRow[];
}

interface CompanyContext {
  accMt: number;
  isFinancial: boolean;
}

async function loadCompany(admin: SupabaseClient, corpCode: string): Promise<CompanyContext> {
  const { data, error } = await admin
    .from("companies")
    .select("acc_mt, sectors(is_financial)")
    .eq("corp_code", corpCode)
    .maybeSingle();
  if (error) throw new Error(`기업 조회 실패: ${error.message}`);
  if (!data) throw new Error(`companies에 없는 기업입니다: ${corpCode}`);

  const row = data as unknown as {
    acc_mt: number | null;
    sectors: { is_financial: boolean } | null;
  };
  if (row.acc_mt == null) {
    throw new Error(
      `결산월(acc_mt)이 없는 기업입니다: ${corpCode} (WU-104 기업개황 조회가 먼저 필요합니다)`,
    );
  }
  return { accMt: row.acc_mt, isFinancial: row.sectors?.is_financial ?? false };
}

function groupByYearReportMetric(
  rows: ReportValueDbRow[],
  accountIdToMetric: Map<string, StandardMetric>,
): ReportsByYearAndCode {
  const result: ReportsByYearAndCode = new Map();

  for (const row of rows) {
    const metric = accountIdToMetric.get(row.account_id);
    if (!metric) continue; // account_map에 없는(우리가 추적하지 않는) 계정은 무시한다.

    if (!result.has(row.bsns_year)) result.set(row.bsns_year, {});
    const byReport = result.get(row.bsns_year)!;
    if (!byReport[row.reprt_code]) byReport[row.reprt_code] = {};
    byReport[row.reprt_code]![metric] = {
      amount3m: row.amount_3m == null ? null : BigInt(row.amount_3m),
      amountCum: row.amount_cum == null ? null : BigInt(row.amount_cum),
    };
  }

  return result;
}
