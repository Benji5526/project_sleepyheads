"use client";

import type { Analysis } from "@/contracts";

// [Phase 1 슬롯 — 담당: 데이터/서버(예림), WU-202] 결과 위: 데이터 버전·[같은 조건으로 재실행]·[최신 데이터로 다시 분석]
// (Q6 rerun)과 "새 데이터 있음" 표시. 새 분석이 생기면 router로 그 분석 주소로 옮기고, 같은 분석이면 onChanged().
// 이 파일은 예림님만 고친다. AnalysisScreen.tsx가 이미 이 자리에 붙여 두었으니 그 파일은 건드리지 않는다.
export interface VersionBarProps {
  analysis: Analysis;
  onChanged: () => void;
}

export function VersionBar(props: VersionBarProps) {
  void props; // 구현하면 지운다
  return null;
}
