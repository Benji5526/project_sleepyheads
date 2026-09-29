// WU-107 완료조건: 원문 링크가 DART 해당 공시로 연결된다.
const DART_VIEWER_BASE_URL = "https://dart.fss.or.kr/dsaf001/main.do";

/** 공시 원문 뷰어(DART) 링크. */
export function buildDartDisclosureUrl(rceptNo: string): string {
  return `${DART_VIEWER_BASE_URL}?rcpNo=${rceptNo}`;
}
