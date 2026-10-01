// [Phase 3 — 담당: 통합/배포(병준)] 대용량 처리 한도 (TECH §12.5, WU-403). Phase 3 고정 계약 — PHASE3_PLAN §3.
// 보드 필터 다시 계산(B2, 예림)이 계산하기 **전에** 부른다. 함수 이름·인자는 잠금, 안은 측정(tests/perf/RESULTS.md)으로 다듬었다.
//
// 측정(2026-10-01, 가상 118,800행 = 2,700곳 × 44분기 × 1계정, PGlite): 행 수 추정 = 실제 행 수(정확히 일치),
// 섹터별×연도별 DB 안 집계 0.43초·서버 힙 1.1MB. 같은 일을 원자료를 서버로 가져와 하면 1.2초·99.5MB·15.6MB 전송.
// → 15만 행 한도는 그대로 둔다(한도 근처에서도 1초 안팎). 30초 상한은 DB가 크게 느려졌을 때를 위한 안전장치다.
import { HttpError } from "@/lib/api/errors";

/** 집계 대상 행 수 상한 (기업 × 분기 × 계정) — 넘으면 413 TOO_LARGE */
export const MAX_AGGREGATE_ROWS = 150_000;
/** 차트 한 개의 점 수 상한 — 넘으면 거절이 아니라 "묶음 단위를 키우세요" 안내 */
export const MAX_CHART_POINTS = 500;
/** 집계 한 번의 실행 시간 상한 (TECH §12.5) — 서버가 이 시간에 DB 함수 호출을 끊는다(`boards/sector-aggregate.ts`) */
export const MAX_AGGREGATE_SECONDS = 30;
/** Postgres `statement_timeout` 값 ("30s") */
export const AGGREGATE_STATEMENT_TIMEOUT = `${MAX_AGGREGATE_SECONDS}s`;

export interface AggregateSize {
  companies: number;
  quarters: number;
  /** 계정(지표 계산에 쓰는 원자료 계정) 수 */
  accounts: number;
}

const whole = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

/**
 * 집계가 읽을 원자료 행 수. `report_values`는 (기업, 분기, 계정)마다 한 줄이라 곱이 실제 행 수와 같다
 * (측정에서 확인 — 정정 공시로 대체된 줄은 집계에서 빠지므로 세지 않는다). 0 이하·숫자 아닌 값은 0으로 본다.
 */
export function estimateAggregateRows(size: AggregateSize): number {
  return whole(size.companies) * whole(size.quarters) * whole(size.accounts);
}

/** 다른 두 값은 그대로 둘 때 한도 안에 들어가는 가장 큰 값 (0이면 그 값만 줄여서는 안 된다) */
function largestWithin(other1: number, other2: number): number {
  return Math.floor(MAX_AGGREGATE_ROWS / (Math.max(1, whole(other1)) * Math.max(1, whole(other2))));
}

/** "(예: 기간을 40분기 이하로, 또는 기업을 1,136곳 이하로)" — 한쪽만 줄여도 되는 만큼 */
function reductionExample(maxQuarters: number, maxCompanies: number): string {
  const parts: string[] = [];
  if (maxQuarters >= 1) parts.push(`기간을 ${maxQuarters}분기 이하로`);
  if (maxCompanies >= 1) parts.push(`기업을 ${maxCompanies.toLocaleString("ko-KR")}곳 이하로`);
  return parts.length > 0 ? ` (예: ${parts.join(", 또는 ")})` : "";
}

/** @throws HttpError TOO_LARGE — 얼마나 줄이면 되는지(기간·기업 수) 안내와 함께 */
export function assertAggregateSize(size: AggregateSize): void {
  const rows = estimateAggregateRows(size);
  if (rows <= MAX_AGGREGATE_ROWS) return;
  const maxQuarters = largestWithin(size.companies, size.accounts);
  const maxCompanies = largestWithin(size.quarters, size.accounts);
  throw new HttpError(
    "TOO_LARGE",
    `처리 한도(${MAX_AGGREGATE_ROWS.toLocaleString("ko-KR")}행)를 넘었습니다 — 약 ${rows.toLocaleString("ko-KR")}행. 기간이나 비교 기업 수를 줄여 주세요${reductionExample(maxQuarters, maxCompanies)}.`,
    { details: { estimatedRows: rows, maxRows: MAX_AGGREGATE_ROWS, maxQuarters, maxCompanies } },
  );
}

/** 점이 많은 차트 안내 (없으면 null) — 결과의 `basis.flags`나 차트 주석에 붙인다 */
export function chartPointsNotice(points: number): string | null {
  // 문구는 첫 버전 그대로 둔다 — 다른 트랙(B2 결과의 basis.flags)이 이 문장을 그대로 쓴다
  return points > MAX_CHART_POINTS
    ? `차트 점이 ${points}개로 많습니다 — 묶음 단위를 분기에서 연도로 키우면 보기 쉽습니다.`
    : null;
}

/** 집계가 30초 상한에 걸렸는가 — Postgres `statement_timeout`(SQLSTATE 57014) 또는 서버 쪽 요청 끊기(AbortSignal.timeout) */
export function isAggregateTimeout(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, name, message } = err as { code?: unknown; name?: unknown; message?: unknown };
  // DB가 statement_timeout으로 멈췄거나(57014), 서버가 AbortSignal.timeout으로 요청을 끊었거나(TimeoutError —
  // supabase-js는 "TimeoutError: signal timed out" 문구로 돌려준다). 그냥 AbortError(연결 끊김 등)는 시간 초과가 아니다
  return (
    code === "57014" ||
    name === "TimeoutError" ||
    (typeof message === "string" &&
      /TimeoutError|statement timeout|canceling statement/i.test(message))
  );
}

/** 집계 30초 상한에 닿았을 때 화면에 보낼 오류 (TECH §12.5 "중단 + 안내") */
export function aggregateTimeoutError(): HttpError {
  return new HttpError(
    "TOO_LARGE",
    `집계가 ${MAX_AGGREGATE_SECONDS}초 안에 끝나지 않아 멈췄습니다. 기간이나 비교 기업 수를 줄여 다시 시도해 주세요.`,
    { details: { maxSeconds: MAX_AGGREGATE_SECONDS } },
  );
}
