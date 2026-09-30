// WU-110 `get_financials` 도구: 요청 범위를 덮는 보고서를 모으고(WU-105), 달력 분기 지표를
// 계산한다(WU-106). 외부 호출·계산 자체는 기존 WU-105·106 모듈에 그대로 맡기고, 여기서는
// "이 회사·이 기간에 뭐가 필요한가"만 정리한다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyRef, Quarter } from "@/contracts";
import { ensureReportValues } from "@/lib/financials/report-values";
import {
  computeCalendarQuarterMetrics,
  type CalendarQuarterMetricsRow,
} from "@/lib/metrics/persist";
import { formatQuarter } from "@/lib/ask/quarter";
import { createConcurrencyGate } from "@/lib/quota/concurrency";
import { reportsNeededForFiscalQuarters } from "@/lib/financials/period";
import { pinsOf, type DataSource } from "@/lib/versions/version";
import {
  type FiscalRef,
  mapCalendarRangeToFiscalQuarters,
  reportsForCalendarRange,
} from "./quarter-reports";

const REPORT_FETCH_CONCURRENCY = 4;

export interface CompanyFinancials {
  /** "2026Q2" → 그 분기의 계산된 지표 (요청 범위 밖의 인접 분기도 QoQ/YoY 계산용으로 더 들어 있을 수 있다). */
  metricsByQuarter: Map<Quarter, CalendarQuarterMetricsRow>;
  /** 달력 분기 → 그 값의 근거가 된 회계 분기 (Figure.basis.report 표시용). */
  fiscalRefByQuarter: Map<Quarter, FiscalRef>;
  /**
   * 계산에 필요한 보고서가 전자공시에 없는(013) 달력 분기. 값이 비면 "계정 값 없음"이 아니라
   * "보고서 없음"으로 안내한다 (WU-199 "데이터 없음·계정 값 없음 각각 안내").
   */
  quartersWithoutReport?: ReadonlySet<Quarter>;
  /** 결산월 — 근거 보고서 이름을 OpenDART 연도로 보여 줄 때 쓴다 (없으면 12월) */
  accMt?: number;
  /** 계산에 쓴 보고서 출처 (WU-202 데이터 버전). 테스트용 가짜 값에서는 비어 있을 수 있다 */
  sources?: DataSource[];
  /** 이번에 부른 전자공시 호출 수 — 캐시 적중은 세지 않는다 (`ensureCompanyFinancials`만 채운다) */
  externalCalls?: number;
}

export interface EnsureCompanyFinancialsOptions {
  userId?: string | null;
  analysisId?: string | null;
  client?: SupabaseClient;
}

/**
 * `company`의 [`from`, `to`] 범위를 채우는 보고서를 확보(캐시 우선)하고, 달력 분기 지표를 계산한다.
 * 이미 수집된 보고서는 `ensureReportValues`가 외부 호출 없이 곧바로 끝낸다(WU-105 완료조건).
 * 계산은 이번에 확인한 보고서의 접수번호로 못 박아서 한다(WU-202) — 같은 출처로 다시 계산하면 같은 숫자.
 */
export async function ensureCompanyFinancials(
  company: CompanyRef,
  from: Quarter,
  to: Quarter,
  options: EnsureCompanyFinancialsOptions = {},
): Promise<CompanyFinancials> {
  const fiscalRefByQuarter = mapCalendarRangeToFiscalQuarters(company.fiscalMonth, from, to);
  const reports = reportsForCalendarRange(fiscalRefByQuarter, company.fiscalMonth);

  // 처음 조회하는 기업은 보고서가 20개 넘게 필요하다(5년 추이 + 증감률용 앞 분기). 하나씩 받으면
  // 60초를 넘겨 Vercel이 끊으므로 몇 개씩 동시에 받는다 (OpenDART 동시 호출 상한 5개 안쪽).
  const gate = createConcurrencyGate(REPORT_FETCH_CONCURRENCY);
  const fetched = await Promise.all(
    reports.map((report) =>
      gate.run(() =>
        ensureReportValues(company.corpCode, report.bsnsYear, report.reprtCode, {
          userId: options.userId ?? null,
          analysisId: options.analysisId ?? null,
          client: options.client,
        }),
      ),
    ),
  );

  const sources: DataSource[] = fetched.map((r) => ({
    corpCode: company.corpCode,
    bsnsYear: r.bsnsYear,
    reprtCode: r.reprtCode,
    fsDiv: r.fsDiv,
    rceptNo: r.fsDiv ? r.rceptNo : null,
  }));
  const financials = await financialsFromSources(company, from, to, sources, {
    client: options.client,
  });
  return { ...financials, externalCalls: fetched.reduce((n, r) => n + r.externalCalls, 0) };
}

/**
 * 정해진 출처(데이터 버전)만으로 계산한다 — 외부 호출 없음. 재실행(WU-202)과 전처리 선택을
 * 적용한 재계산(WU-203)이 쓴다. 출처에 없는 보고서는 읽지 않는다.
 */
export async function financialsFromSources(
  company: CompanyRef,
  from: Quarter,
  to: Quarter,
  sources: readonly DataSource[],
  options: { client?: SupabaseClient } = {},
): Promise<CompanyFinancials> {
  const fiscalRefByQuarter = mapCalendarRangeToFiscalQuarters(company.fiscalMonth, from, to);
  const own = sources.filter((s) => s.corpCode === company.corpCode);

  const missingReports = new Set(
    own.filter((s) => s.fsDiv === null).map((s) => `${s.bsnsYear}-${s.reprtCode}`),
  );
  const quartersWithoutReport = new Set<Quarter>();
  for (const [quarter, ref] of fiscalRefByQuarter) {
    // 4분기는 사업보고서와 3분기보고서가 둘 다 있어야 계산된다 — 하나라도 없으면 보고서 없음
    const needed = reportsNeededForFiscalQuarters([ref], company.fiscalMonth);
    if (needed.some((r) => missingReports.has(`${r.bsnsYear}-${r.reprtCode}`))) {
      quartersWithoutReport.add(quarter);
    }
  }

  const rows = await computeCalendarQuarterMetrics(company.corpCode, {
    client: options.client,
    pins: pinsOf(own, company.corpCode),
  });
  const metricsByQuarter = new Map<Quarter, CalendarQuarterMetricsRow>();
  for (const row of rows) {
    metricsByQuarter.set(formatQuarter(row.cal_year, row.cal_quarter), row);
  }

  return {
    metricsByQuarter,
    fiscalRefByQuarter,
    quartersWithoutReport,
    accMt: company.fiscalMonth,
    sources: own,
  };
}
