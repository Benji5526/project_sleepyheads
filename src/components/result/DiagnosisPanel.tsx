"use client";

import type { Analysis } from "@/contracts";

// [Phase 1 슬롯 — 담당: 통합/배포(병준), WU-203 화면] `awaiting_preprocess`일 때 전처리 진단 카드와 선택지.
// 고르면 Q5(preprocess) → onChanged()로 다시 불러온다 (AnalysisScreen이 Q4 실행을 이어 간다).
// 서버(진단 만들기·Q5)는 데이터/서버(예림) 담당 — 계약은 src/contracts/board.ts Diagnosis, project.ts PreprocessRequest.
// 이 파일은 병준님만 고친다.
export interface DiagnosisPanelProps {
  analysis: Analysis;
  onChanged: () => void;
}

export function DiagnosisPanel(props: DiagnosisPanelProps) {
  void props; // 구현하면 지운다
  return null;
}
