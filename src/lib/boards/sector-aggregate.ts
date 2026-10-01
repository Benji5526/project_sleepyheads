// WU-403 DB 안 SQL 집계 (TECH §12.5 "대용량 집계는 DB 안에서 SQL로 처리하고 결과만 서버로 가져온다").
// 섹터별·분기별(또는 연도별) 합계를 DB 함수 aggregate_sector_metrics가 계산하고, 서버는 결과 행만 받는다
// (상장사 2,700곳 × 44분기 ≈ 12만 행을 서버로 가져오지 않는다). 병준님이 tests/perf/에서 이 함수로 측정한다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Quarter } from "@/contracts";
import { quarterSpan } from "@/lib/ask/quarter";
import { assertAggregateSize } from "@/lib/limits/size";
import { CALC_VERSION } from "@/lib/metrics/types";

/** 더할 수 있는 금액 지표 (비율·잔액은 더하면 뜻이 없다 — DB 함수도 같은 목록만 받는다) */
export const SUMMABLE_SECTOR_METRICS = [
  "revenue",
  "operating_income",
  "net_income",
  "owners_net_income",
] as const;
export type SummableSectorMetric = (typeof SUMMABLE_SECTOR_METRICS)[number];

export interface SectorAggregateParams {
  from: Quarter;
  to: Quarter;
  metrics: SummableSectorMetric[];
  /** true면 연도별 (그 해 1~4분기가 모두 있는 기업만 더한다) */
  byYear?: boolean;
}

export interface SectorAggregateRow {
  sectorName: string;
  isFinancial: boolean;
  /** "2026Q2" 또는 연도별이면 "2026" */
  period: string;
  metric: SummableSectorMetric;
  /** 원 단위 합계. 원 단위 금액은 2^53을 넘을 수 있어 글자로 받아 bigint로 바꾼다 */
  total: bigint;
  /** 더한 기업 수 */
  companyCount: number;
}

interface RpcRow {
  sector_name: string;
  is_financial: boolean;
  period: string;
  metric: SummableSectorMetric;
  total: string;
  company_count: number;
}

/**
 * 처리 한도를 먼저 검사한 뒤(413 TOO_LARGE) DB 함수로 섹터 합계를 구한다.
 * 기업 수는 지금 기업 목록 전체 수로 어림한다 (DB 함수가 전체 기업을 훑기 때문).
 */
export async function aggregateSectorMetrics(
  admin: SupabaseClient,
  params: SectorAggregateParams,
): Promise<SectorAggregateRow[]> {
  const { count, error: countError } = await admin
    .from("companies")
    .select("corp_code", { count: "exact", head: true });
  if (countError) throw new Error(`기업 수 조회 실패: ${countError.message}`);

  // 달력 분기 변환본은 기업·분기마다 한 행에 모든 지표가 들어 있다(metrics jsonb) — 훑는 행은 기업 × 분기
  assertAggregateSize({
    companies: count ?? 0,
    quarters: quarterSpan(params.from, params.to),
    accounts: 1,
  });

  const { data, error } = await admin.rpc("aggregate_sector_metrics", {
    p_from: params.from,
    p_to: params.to,
    p_metrics: params.metrics,
    p_by_year: params.byYear ?? false,
    p_calc_version: CALC_VERSION,
  });
  if (error) throw new Error(`섹터 합계 계산 실패: ${error.message}`);
  return ((data ?? []) as RpcRow[]).map((row) => ({
    sectorName: row.sector_name,
    isFinancial: row.is_financial,
    period: row.period,
    metric: row.metric,
    total: BigInt(row.total),
    companyCount: row.company_count,
  }));
}
