"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import type { Analysis } from "@/contracts";
import { ErrorCard } from "@/components/ask/ErrorCard";
import { describeError, type ErrorNotice } from "@/components/ask/errorMessages";
import { useSession } from "@/components/session/SessionProvider";
import { rerunAnalysis } from "@/lib/api-client/versions";

// [Phase 1 슬롯 — 담당: 데이터/서버(예림), WU-202] 결과 위: 데이터 버전·[같은 조건으로 재실행]·[최신 데이터로 다시 분석]
// (Q6 rerun)과 "새 데이터 있음" 표시. 새 분석이 생기면 router로 그 분석 주소로 옮기고, 같은 분석이면 onChanged().
// 이 파일은 예림님만 고친다. AnalysisScreen.tsx가 이미 이 자리에 붙여 두었으니 그 파일은 건드리지 않는다.
export interface VersionBarProps {
  analysis: Analysis;
  onChanged: () => void;
}

/** 재실행 뒤 새 분석 주소에 붙이는 표시 — 같은 조건 재실행의 숫자 비교 결과 */
const SAME_PARAM = "same";

export function VersionBar({ analysis }: VersionBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { applyRemaining } = useSession();
  const [pending, setPending] = useState<"same" | "latest" | null>(null);
  const [notice, setNotice] = useState<ErrorNotice | null>(null);

  const basis = analysis.result?.basis;
  if (!basis) return null;

  const sameParam = searchParams.get(SAME_PARAM);

  async function rerun(useLatestData: boolean) {
    setPending(useLatestData ? "latest" : "same");
    setNotice(null);
    try {
      const { data, questionsRemaining } = await rerunAnalysis(
        analysis.id,
        useLatestData,
        crypto.randomUUID(),
      );
      applyRemaining(questionsRemaining);
      const query = new URLSearchParams({ analysis: data.analysisId });
      if (data.sameNumbers !== null) query.set(SAME_PARAM, data.sameNumbers ? "1" : "0");
      router.push(`/p/${analysis.projectId}?${query.toString()}`);
    } catch (error) {
      setNotice(describeError(error));
    } finally {
      setPending(null);
    }
  }

  return (
    <section
      aria-label="데이터 버전"
      className="space-y-3 rounded-xl border border-line bg-surface p-4 text-sm"
    >
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p>
          <span className="text-xs text-muted">데이터 버전</span>{" "}
          <code className="font-mono font-medium" title={basis.dataVersionId}>
            {basis.dataVersionId.slice(0, 8)}
          </code>
        </p>
        {basis.newerDataVersionAvailable && (
          <p
            role="status"
            className="rounded-md bg-notice-bg px-2 py-0.5 text-notice-ink"
            data-testid="newer-version"
          >
            이전 데이터 버전 기준 · 새 데이터 버전 있음
          </p>
        )}
        {sameParam !== null && (
          <p role="status" className="text-muted" data-testid="rerun-same">
            {sameParam === "1"
              ? "같은 조건으로 다시 계산했습니다 — 숫자가 원래 결과와 모두 같습니다."
              : "같은 조건으로 다시 계산했는데 숫자가 원래와 다릅니다. 문의해 주세요."}
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void rerun(false)}
          disabled={pending !== null}
          className="inline-flex h-9 items-center rounded-lg border border-line px-3 font-medium hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {pending === "same" ? "다시 계산하는 중…" : "같은 조건으로 재실행"}
        </button>
        <button
          type="button"
          onClick={() => void rerun(true)}
          disabled={pending !== null}
          className={`inline-flex h-9 items-center rounded-lg border px-3 font-medium disabled:opacity-50 ${
            basis.newerDataVersionAvailable
              ? "border-accent bg-accent text-white hover:opacity-90"
              : "border-line hover:border-accent hover:text-accent"
          }`}
        >
          {pending === "latest" ? "새로 분석하는 중…" : "최신 데이터로 다시 분석"}
        </button>
      </div>
      <p className="text-xs text-muted">
        같은 조건 재실행은 질문 수를 쓰지 않습니다. 최신 데이터로 다시 분석하면 질문 1회가 사용되고,
        이전 결과는 그대로 남습니다.
      </p>

      {notice && <ErrorCard notice={notice} />}
    </section>
  );
}
