// WU-203 Q5: 진단 카드 선택(diagnosisId·optionId)을 진단 종류별 선택으로 바꾸고 검사한다.
import type { Diagnosis } from "@/contracts";
import { HttpError } from "@/lib/api/errors";
import { isValidOption, type PreprocessDecisions } from "./types";

/** 요청 선택을 진단 종류별 선택으로 바꾼다. 확인이 필요한 진단이 빠졌거나 없는 선택지면 400 */
export function toDecisions(
  diagnoses: readonly Diagnosis[],
  requested: readonly { diagnosisId: string; optionId: string }[],
): PreprocessDecisions {
  const byId = new Map(diagnoses.map((d) => [d.id, d]));
  const decisions: PreprocessDecisions = {};
  for (const { diagnosisId, optionId } of requested) {
    const diagnosis = byId.get(diagnosisId);
    if (!diagnosis) {
      throw new HttpError("VALIDATION_ERROR", `없는 진단입니다: ${diagnosisId}`, {
        details: { diagnosisId },
      });
    }
    if (!isValidOption(diagnosis.kind, optionId)) {
      throw new HttpError("VALIDATION_ERROR", `없는 선택지입니다: ${optionId}`, {
        details: { diagnosisId, optionId },
      });
    }
    decisions[diagnosis.kind] = optionId;
  }
  const missing = diagnoses.filter((d) => d.needsConfirmation && !decisions[d.kind]);
  if (missing.length > 0) {
    throw new HttpError("VALIDATION_ERROR", "확인이 필요한 진단을 모두 골라 주세요.", {
      details: { missing: missing.map((d) => d.id) },
    });
  }
  return decisions;
}
