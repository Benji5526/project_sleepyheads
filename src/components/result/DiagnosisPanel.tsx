"use client";

import { useId, useState } from "react";
import type { Analysis, Diagnosis } from "@/contracts";
import { ErrorCard } from "@/components/ask/ErrorCard";
import { describeError, type ErrorNotice } from "@/components/ask/errorMessages";
import { ApiRequestError } from "@/lib/api-client/errors";
import { submitPreprocess } from "@/lib/api-client/preprocess";
import { formatKrw } from "@/lib/runner/format";

// `awaiting_preprocess`일 때 전처리 진단 카드와 선택지 (WU-203 화면, PRD F-D1~D4, TECH §9).
// 고르면 Q5(preprocess) → onChanged()로 다시 불러온다 (AnalysisScreen이 Q4 실행을 이어 간다).
// 서버(진단 만들기·Q5)는 데이터/서버(예림) 담당 — 계약은 src/contracts/board.ts Diagnosis, project.ts PreprocessRequest.
export interface DiagnosisPanelProps {
  analysis: Analysis;
  onChanged: () => void;
}

type Option = Diagnosis["options"][number];

function defaultChoices(diagnoses: Diagnosis[]): Record<string, string> {
  const choices: Record<string, string> = {};
  for (const d of diagnoses) {
    const option = d.options.find((o) => o.isDefault);
    if (option) choices[d.id] = option.id;
  }
  return choices;
}

function sumText(value: number): string {
  return formatKrw(BigInt(Math.round(value)));
}

function PreviewText({ preview }: { preview: Option["preview"] }) {
  return (
    <span className="block text-sm text-muted">
      처리 전 {preview.rowsBefore.toLocaleString("ko-KR")}행 → 처리 후{" "}
      <span className="font-medium text-ink">{preview.rowsAfter.toLocaleString("ko-KR")}행</span>
      {preview.sumBefore !== undefined && preview.sumAfter !== undefined && (
        <>
          {" · "}합계 {sumText(preview.sumBefore)} →{" "}
          <span className="font-medium text-ink">{sumText(preview.sumAfter)}</span>
        </>
      )}
    </span>
  );
}

export function DiagnosisPanel({ analysis, onChanged }: DiagnosisPanelProps) {
  const titleId = useId();
  const toConfirm = analysis.diagnoses.filter((d) => d.needsConfirmation);
  const automatic = analysis.diagnoses.filter((d) => !d.needsConfirmation);
  const [choices, setChoices] = useState(() => defaultChoices(toConfirm));
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<ErrorNotice | null>(null);

  const allChosen = toConfirm.every((d) => d.options.some((o) => o.id === choices[d.id]));

  async function submit() {
    if (!allChosen || pending) return;
    setPending(true);
    setNotice(null);
    try {
      await submitPreprocess(analysis.id, {
        decisions: toConfirm.map((d) => ({ diagnosisId: d.id, optionId: choices[d.id] })),
      });
      onChanged();
    } catch (error) {
      setPending(false);
      // 다른 탭에서 이미 처리했으면 최신 상태를 다시 불러온다
      if (error instanceof ApiRequestError && error.code === "INVALID_STATE") {
        onChanged();
        return;
      }
      setNotice(describeError(error));
    }
  }

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-xl border border-line border-l-4 border-l-accent bg-surface p-5 sm:p-6"
    >
      <h2 id={titleId} className="text-lg font-semibold">
        계산 전에 확인할 데이터가 있습니다
      </h2>
      <p className="mt-2 leading-7 text-muted">
        공시 데이터에서 아래 문제를 찾았습니다. 처리 방식을 고르면 계산을 이어 갑니다. 고른 방식은
        분석 기록에 남고, 같은 조건으로 다시 실행해도 똑같이 적용됩니다.
      </p>

      {toConfirm.length > 0 && (
        <div className="mt-5 space-y-4">
          {toConfirm.map((diagnosis) => (
            <fieldset key={diagnosis.id} className="rounded-lg border border-line p-4">
              <legend className="px-1 font-medium">{diagnosis.description}</legend>
              <p className="text-sm text-muted">
                영향받는 행 {diagnosis.affectedRows.toLocaleString("ko-KR")}개
              </p>
              <div className="mt-3 space-y-2">
                {diagnosis.options.map((option) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-line px-3 py-2.5 has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
                  >
                    <input
                      type="radio"
                      name={`${titleId}-${diagnosis.id}`}
                      value={option.id}
                      checked={choices[diagnosis.id] === option.id}
                      disabled={pending}
                      onChange={() => setChoices((c) => ({ ...c, [diagnosis.id]: option.id }))}
                      className="mt-1.5 accent-[var(--accent)]"
                    />
                    <span className="min-w-0">
                      <span className="block">
                        {option.label}
                        {option.isDefault && (
                          <span className="ml-2 text-xs text-muted">(기본)</span>
                        )}
                      </span>
                      <PreviewText preview={option.preview} />
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      )}

      {automatic.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold">확인 없이 자동으로 처리하는 항목</h3>
          <ul className="mt-2 space-y-1 text-sm text-muted">
            {automatic.map((diagnosis) => (
              <li key={diagnosis.id}>
                {diagnosis.description}
                {diagnosis.options.find((o) => o.isDefault) &&
                  ` — ${diagnosis.options.find((o) => o.isDefault)!.label}`}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void submit()}
          disabled={pending || !allChosen}
          className="h-10 rounded-lg bg-accent px-5 font-medium text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {toConfirm.length > 0 ? "이 방식으로 계산하기" : "계산 이어 가기"}
        </button>
        {!allChosen && <p className="text-sm text-muted">모든 항목의 처리 방식을 골라 주세요.</p>}
        {pending && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <span
              aria-hidden="true"
              className="size-4 animate-spin rounded-full border-2 border-line border-t-accent"
            />
            고른 방식으로 계산하는 중입니다.
          </p>
        )}
      </div>

      {notice && (
        <div className="mt-5">
          <ErrorCard notice={notice} />
        </div>
      )}
    </section>
  );
}
