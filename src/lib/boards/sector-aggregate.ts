// WU-403 DB 안 SQL 집계 (TECH §12.5 "대용량 집계는 DB 안에서 SQL로 처리하고 결과만 서버로 가져온다").
// 섹터별·분기별(또는 연도별) 합계를 DB 함수 aggregate_sector_metrics가 계산하고, 서버는 결과 행만 받는다
// (상장사 2,700곳 × 44분기 ≈ 12만 행을 서버로 가져오지 않는다). 병준님이 tests/perf/에서 이 함수로 측정한다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Quarter } from "@/contracts";
import { quarterSpan } from "@/lib/ask/quarter";
import { HttpError } from "@/lib/api/errors";
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

/** 집계 실행 시간 상한 (TECH §12.5 "집계 실행 시간 30초 — 중단 + 안내") */
export const AGGREGATE_TIMEOUT_MS = 30_000;

/**
 * 집계가 시간 상한에 걸렸는가 — 서버가 요청을 끊었거나(AbortSignal.timeout → TimeoutError/AbortError),
 * DB가 statement_timeout으로 멈췄거나(57014 query_canceled).
 * 통합 때 병준님 `@/lib/limits`의 `isAggregateTimeout`이 생기면 그것으로 바꾼다.
 */
function isAggregateTimeoutError(error: {
  code?: string;
  message?: string;
  name?: string;
}): boolean {
  return (
    error.code === "57014" ||
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    /TimeoutError|AbortError|statement timeout|canceling statement/i.test(error.message ?? "")
  );
}

/** 시간 상한 초과 안내 — 413 TOO_LARGE. 통합 때 병준님 `aggregateTimeoutError()`로 바꾼다 */
function aggregateTimeout(): HttpError {
  return new HttpError(
    "TOO_LARGE",
    `집계가 ${AGGREGATE_TIMEOUT_MS / 1000}초 안에 끝나지 않아 중단했습니다. 기간이나 기업 수를 줄여 주세요.`,
  );
}

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

  // 30초에서 서버가 요청을 끊는다. 함수 안의 `set local statement_timeout`은 이미 시작된 이 호출에는
  // 걸리지 않아(타이머는 바깥 쿼리 시작 때 맞춰진다) 쓰지 않았다 — DB 쪽 상한은 운영에서 역할 설정으로 확인
  let response;
  try {
    response = await admin
      .rpc("aggregate_sector_metrics", {
        p_from: params.from,
        p_to: params.to,
        p_metrics: params.metrics,
        p_by_year: params.byYear ?? false,
        p_calc_version: CALC_VERSION,
      })
      .abortSignal(AbortSignal.timeout(AGGREGATE_TIMEOUT_MS));
  } catch (err) {
    if (err instanceof Error && isAggregateTimeoutError(err)) throw aggregateTimeout();
    throw err;
  }
  const { data, error } = response;
  if (error) {
    if (isAggregateTimeoutError(error)) throw aggregateTimeout();
    throw new Error(`섹터 합계 계산 실패: ${error.message}`);
  }
  return ((data ?? []) as RpcRow[]).map((row) => ({
    sectorName: row.sector_name,
    isFinancial: row.is_financial,
    period: row.period,
    metric: row.metric,
    total: BigInt(row.total),
    companyCount: row.company_count,
  }));
}
