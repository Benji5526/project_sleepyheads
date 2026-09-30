// WU-203: 실행기(src/lib/runner/diagnostics.ts)가 모은 사실로 진단 카드(Diagnosis, API_SPEC Q2·Q5)를 만든다.
// 외부 호출·DB 없음. "행"은 결과 표의 한 줄(기업 × 분기)이고, 합계는 대표 지표(매출 > 영업이익 >
// 당기순이익 중 요청된 첫 번째) 값을 더한 것이다 — 처리 전후 미리보기(TECH §9)에 쓴다.
import type { Diagnosis } from "@/contracts";
import { DIAGNOSIS_OPTIONS, NEEDS_CONFIRMATION, type DiagnosisKind } from "./types";

type Preview = Diagnosis["options"][number]["preview"];

export interface DiagnosisFacts {
  /** 처리 전 결과 표의 행 수 (기업 수 × 요청 분기 수) */
  totalRows: number;
  /** 계정 값 결측: 값이 빈 행 (그 지표가 다른 분기에는 있는 경우만 — 아예 없는 계정은 결측이 아니다) */
  missing?: {
    affectedRows: number;
    description: string;
    /** 처리 전 대표 지표 합계 (빈 행은 더하지 않음) */
    sum: number | null;
    /** 해당 분기를 뺐을 때 대표 지표 합계 */
    sumExcluded: number | null;
  };
  /** 정정 공시 중복: 최초 공시와 정정본이 둘 다 있는 보고서의 값을 쓰는 행 */
  duplicate?: {
    affectedRows: number;
    description: string;
    /** 처리 전 = 두 공시 값을 모두 센 합계 */
    sumBoth: number | null;
    sumLatest: number | null;
    sumFirst: number | null;
  };
  /** 연결·별도 혼재: 연결(CFS) 보고서에서 온 행 (별도로 통일하면 바뀌는 행) */
  mixed?: { affectedRows: number; description: string };
  fiscalMonth?: { description: string };
  boundaryMismatch?: { description: string };
}

function makeDiagnosis(
  kind: DiagnosisKind,
  description: string,
  affectedRows: number,
  previews: Record<string, Preview>,
): Diagnosis {
  return {
    id: kind,
    kind,
    needsConfirmation: NEEDS_CONFIRMATION.has(kind),
    description,
    affectedRows,
    options: DIAGNOSIS_OPTIONS[kind].map((option, index) => ({
      id: option.id,
      label: option.label,
      isDefault: index === 0,
      preview: previews[option.id],
    })),
  };
}

function withSums(
  rowsBefore: number,
  rowsAfter: number,
  sumBefore: number | null,
  sumAfter: number | null,
): Preview {
  return {
    rowsBefore,
    rowsAfter,
    ...(sumBefore !== null ? { sumBefore } : {}),
    ...(sumAfter !== null ? { sumAfter } : {}),
  };
}

/** TECH §9 표 순서(결측 → 정정 중복 → 연결/별도 → 결산월 → 분기 경계)로 진단을 만든다 */
export function buildDiagnoses(facts: DiagnosisFacts): Diagnosis[] {
  const n = facts.totalRows;
  const diagnoses: Diagnosis[] = [];

  if (facts.missing && facts.missing.affectedRows > 0) {
    const m = facts.missing;
    diagnoses.push(
      makeDiagnosis("missing_account", m.description, m.affectedRows, {
        exclude_quarter: withSums(n, n - m.affectedRows, m.sum, m.sumExcluded),
        show_blank: withSums(n, n, m.sum, m.sum),
      }),
    );
  }

  if (facts.duplicate && facts.duplicate.affectedRows > 0) {
    const d = facts.duplicate;
    const before = n + d.affectedRows;
    diagnoses.push(
      makeDiagnosis("duplicate_correction", d.description, d.affectedRows, {
        latest_correction: withSums(before, n, d.sumBoth, d.sumLatest),
        first_filing: withSums(before, n, d.sumBoth, d.sumFirst),
      }),
    );
  }

  if (facts.mixed && facts.mixed.affectedRows > 0) {
    // 별도 값은 아직 받지 않았을 수 있어 합계 미리보기는 없다 (고르면 그때 받는다)
    diagnoses.push(
      makeDiagnosis("mixed_fs_div", facts.mixed.description, facts.mixed.affectedRows, {
        unify_ofs: { rowsBefore: n, rowsAfter: n },
        keep_mixed: { rowsBefore: n, rowsAfter: n },
      }),
    );
  }

  if (facts.fiscalMonth) {
    diagnoses.push(
      makeDiagnosis("fiscal_month", facts.fiscalMonth.description, n, {
        calendar_convert: { rowsBefore: n, rowsAfter: n },
      }),
    );
  }

  if (facts.boundaryMismatch) {
    diagnoses.push(
      makeDiagnosis("boundary_mismatch", facts.boundaryMismatch.description, n, {
        end_month_assign: { rowsBefore: n, rowsAfter: n },
      }),
    );
  }

  return diagnoses;
}
