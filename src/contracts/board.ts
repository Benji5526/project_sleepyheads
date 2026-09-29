// API_SPEC §2.7 전처리·보드·사용량
import type { Quarter } from "./base";

export interface Diagnosis {
  id: string;
  kind:
    | "missing_account"
    | "duplicate_correction"
    | "mixed_fs_div"
    | "fiscal_month"
    | "boundary_mismatch";
  needsConfirmation: boolean;
  description: string; // "2025Q4 영업이익 값 없음"
  affectedRows: number;
  options: {
    id: string;
    label: string;
    isDefault: boolean;
    preview: { rowsBefore: number; rowsAfter: number; sumBefore?: number; sumAfter?: number };
  }[];
}

export interface BoardFilters {
  period?: { from: Quarter; to: Quarter };
  peers?: string[]; // stockCode 목록 (최대 5)
}

export interface Usage {
  questionsUsed: number;
  questionsLimit: number;
  resetAt: string; // 다음 한국 시간 00:00
  serviceStatus: "ok" | "degraded" | "budget_reached";
}
