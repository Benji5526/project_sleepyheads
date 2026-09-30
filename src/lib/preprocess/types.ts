// WU-203 전처리 진단 (TECH §9): 진단 종류·선택지·기본값. 화면 계약은 src/contracts/board.ts `Diagnosis`.
import type { Diagnosis } from "@/contracts";

export type DiagnosisKind = Diagnosis["kind"];

/** 진단 종류 → 고른 선택지 id. 데이터 버전의 일부라 재실행 때 같은 선택이 그대로 적용된다 */
export type PreprocessDecisions = Partial<Record<DiagnosisKind, string>>;

interface OptionSpec {
  id: string;
  label: string;
}

/** 선택지 목록. 첫 번째가 기본값(★, TECH §9) */
export const DIAGNOSIS_OPTIONS: Record<DiagnosisKind, readonly OptionSpec[]> = {
  missing_account: [
    { id: "exclude_quarter", label: "해당 분기 제외" },
    { id: "show_blank", label: "0으로 보지 않고 빈칸으로 표시" },
  ],
  duplicate_correction: [
    { id: "latest_correction", label: "최신 정정본 사용" },
    { id: "first_filing", label: "최초 공시 사용" },
  ],
  mixed_fs_div: [
    { id: "unify_ofs", label: "별도(OFS)로 통일" },
    { id: "keep_mixed", label: "섞인 채 표시 + 경고" },
  ],
  fiscal_month: [{ id: "calendar_convert", label: "달력 분기로 환산" }],
  boundary_mismatch: [{ id: "end_month_assign", label: "종료월 기준 분기 배정 + 주석" }],
};

/** 사용자 확인이 필요한 진단 (나머지는 규칙대로 자동 처리하고 표시만) */
export const NEEDS_CONFIRMATION: ReadonlySet<DiagnosisKind> = new Set([
  "missing_account",
  "duplicate_correction",
  "mixed_fs_div",
]);

export function defaultOptionId(kind: DiagnosisKind): string {
  return DIAGNOSIS_OPTIONS[kind][0].id;
}

export function isValidOption(kind: DiagnosisKind, optionId: string): boolean {
  return DIAGNOSIS_OPTIONS[kind].some((o) => o.id === optionId);
}

/** 발견된 진단마다 선택을 채운다 — 고르지 않은 것은 기본값 */
export function withDefaults(
  diagnoses: readonly Pick<Diagnosis, "kind">[],
  decisions: PreprocessDecisions = {},
): PreprocessDecisions {
  const result: PreprocessDecisions = {};
  for (const { kind } of diagnoses) {
    const chosen = decisions[kind];
    result[kind] = chosen && isValidOption(kind, chosen) ? chosen : defaultOptionId(kind);
  }
  return result;
}

/** 확인이 필요한 진단 중 아직 고르지 않은 것이 있는가 */
export function hasUndecided(
  diagnoses: readonly Diagnosis[],
  decisions: PreprocessDecisions | null | undefined,
): boolean {
  return diagnoses.some((d) => d.needsConfirmation && !decisions?.[d.kind]);
}
