import type { Metadata } from "next";
import { Suspense } from "react";
import { AnalysisScreen } from "@/components/result/AnalysisScreen";

export const metadata: Metadata = { title: "분석 결과" };

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return (
    <Suspense>
      <AnalysisScreen projectId={projectId} />
    </Suspense>
  );
}
