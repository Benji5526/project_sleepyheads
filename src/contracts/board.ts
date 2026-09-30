// API_SPEC §2.7 전처리·보드·사용량
import type { Quarter, UUID } from "./common";
import type { Explanation } from "./explanation";
import type { ResultObject } from "./result";

export interface Diagnosis {
  id: string;
  kind:
    | "missing_account"
    | "duplicate_correction"
    | "mixed_fs_div"
    | "fiscal_month"
    | "boundary_mismatch";
  needsConfirmation: boolean;
  /** "2025Q4 영업이익 값 없음" */
  description: string;
  affectedRows: number;
  options: {
    id: string;
    label: string;
    isDefault: boolean;
    preview: {
      rowsBefore: number;
      rowsAfter: number;
      sumBefore?: number;
      sumAfter?: number;
    };
  }[];
}

export interface BoardFilters {
  period?: { from: Quarter; to: Quarter };
  /** stockCode 목록 (최대 5) */
  peers?: string[];
}

/**
 * B1·B2 응답 (API_SPEC B1). Phase 3 고정 계약 (PHASE3_PLAN §3).
 * 보드는 분석 1개당 1개이고 **보드 ID = 분석 ID**다 — 화면은 `/api/boards/<analysisId>`를 부른다.
 * 필터를 한 번도 안 바꿨으면 `filters: {}` + 원래 결과, `explanationStatus: "ready"`.
 */
export interface BoardView {
  id: UUID;
  analysisId: UUID;
  filters: BoardFilters;
  /** 필터를 적용해 서버가 다시 계산한 결과 (AI 호출 없음) */
  result: ResultObject;
  /** 필터를 바꾼 뒤에는 "stale" — 분석 글은 원래 조건 기준 */
  explanationStatus: "ready" | "stale";
}

/** Q9 응답 — 현재 필터 기준으로 다시 쓴 분석 글 */
export interface RewriteResponse {
  explanation: Explanation;
}

export interface Usage {
  questionsUsed: number;
  questionsLimit: number;
  /** 다음 한국 시간 00:00 */
  resetAt: string;
  serviceStatus: "ok" | "degraded" | "budget_reached";
}
