"use client";

// [Phase 1 슬롯 — 담당: 통합/배포(병준), WU-201] 결과 화면 아래: 같은 프로젝트의 질문 기록(P2) + 후속 질문 입력.
// 이 파일은 병준님만 고친다. AnalysisScreen.tsx가 이미 이 자리에 붙여 두었으니 그 파일은 건드리지 않는다.
export interface ProjectPanelProps {
  projectId: string;
  currentAnalysisId: string;
}

export function ProjectPanel(props: ProjectPanelProps) {
  void props; // 구현하면 지운다
  return null;
}
