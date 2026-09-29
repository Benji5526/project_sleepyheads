// API_SPEC §2.7 전처리·보드·사용량
import type { Quarter } from "./common";

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

export interface Usage {
  questionsUsed: number;
  questionsLimit: number;
  /** 다음 한국 시간 00:00 */
  resetAt: string;
  serviceStatus: "ok" | "degraded" | "budget_reached";
}
