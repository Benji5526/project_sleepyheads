// [Phase 3 — 담당: 통합/배포(병준)] 대용량 처리 한도 (TECH §12.5, WU-403). Phase 3 고정 계약 — PHASE3_PLAN §3.
// 보드 필터 다시 계산(B2, 예림)이 계산하기 **전에** 부른다. 지금은 동작하는 첫 버전이고, 병준님이 측정 뒤 다듬는다.
import { HttpError } from "@/lib/api/errors";

/** 집계 대상 행 수 상한 (기업 × 분기 × 계정) — 넘으면 413 TOO_LARGE */
export const MAX_AGGREGATE_ROWS = 150_000;
/** 차트 한 개의 점 수 상한 — 넘으면 거절이 아니라 "묶음 단위를 키우세요" 안내 */
export const MAX_CHART_POINTS = 500;

export interface AggregateSize {
  companies: number;
  quarters: number;
  /** 계정(지표 계산에 쓰는 원자료 계정) 수 */
  accounts: number;
}

export function estimateAggregateRows(size: AggregateSize): number {
  return size.companies * size.quarters * size.accounts;
}

/** @throws HttpError TOO_LARGE — 기간·기업을 줄이라는 안내와 함께 */
export function assertAggregateSize(size: AggregateSize): void {
  const rows = estimateAggregateRows(size);
  if (rows > MAX_AGGREGATE_ROWS) {
    throw new HttpError(
      "TOO_LARGE",
      `처리 한도(${MAX_AGGREGATE_ROWS.toLocaleString("ko-KR")}행)를 넘었습니다 — 약 ${rows.toLocaleString("ko-KR")}행. 기간이나 비교 기업 수를 줄여 주세요.`,
    );
  }
}

/** 점이 많은 차트 안내 (없으면 null) — 결과의 `basis.flags`나 차트 주석에 붙인다 */
export function chartPointsNotice(points: number): string | null {
  return points > MAX_CHART_POINTS
    ? `차트 점이 ${points}개로 많습니다 — 묶음 단위를 분기에서 연도로 키우면 보기 쉽습니다.`
    : null;
}
