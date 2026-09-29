import { UpstreamApiError } from "@/lib/quota/errors";

/** OpenDART 공식 개발가이드 오류코드 (TECH §3.1, WU-102). */
export const DART_STATUS_MESSAGE: Record<string, string> = {
  "000": "정상",
  "010": "등록되지 않은 키입니다.",
  "011": "사용할 수 없는 키입니다.",
  "012": "접근할 수 없는 IP입니다.",
  "013": "조회된 데이터가 없습니다.",
  "014": "파일이 존재하지 않습니다.",
  "020": "요청 제한을 초과하였습니다.",
  "021": "조회 가능한 회사 개수가 초과하였습니다(최대 100개).",
  "100": "필드의 부적절한 값입니다.",
  "101": "부적절한 접근입니다.",
  "800": "시스템 점검 중입니다.",
  "900": "정의되지 않은 오류가 발생하였습니다.",
  "901": "사용자 계정의 개인정보 보유기간이 만료되어 사용할 수 없는 키입니다.",
};

/** 재요청한다고 나아지지 않는 상태(권한·요청 형식). 800·900만 일시적 오류로 본다. */
const RETRYABLE_STATUS = new Set(["800", "900"]);

/** 정상 응답으로 취급해 그대로 돌려주는 상태. 013(데이터 없음)은 오류가 아니라 빈 결과다. */
export const DART_OK_STATUS = new Set(["000", "013"]);

export class DartApiError extends UpstreamApiError {
  constructor(
    readonly status: string,
    message?: string,
  ) {
    super(
      "dart",
      message ?? DART_STATUS_MESSAGE[status] ?? `알 수 없는 OpenDART 오류(${status})`,
      RETRYABLE_STATUS.has(status),
    );
    this.name = "DartApiError";
  }
}
