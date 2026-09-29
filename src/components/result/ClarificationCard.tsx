"use client";

import { useState } from "react";
import type { Clarification } from "@/contracts";

/** 되묻기 (PRD F-Q3): 후보 중 하나를 고르면 추가 차감 없이 분석을 이어간다 */
export function ClarificationCard({
  clarification,
  onChoose,
}: {
  clarification: Clarification;
  onChoose: (optionId: string) => Promise<void>;
}) {
  const [pending, setPending] = useState<string | null>(null);

  return (
    <section
      aria-labelledby="clarify-title"
      className="rounded-xl border border-line bg-surface p-6"
    >
      <h2 id="clarify-title" className="text-lg font-semibold">
        {clarification.question}
      </h2>
      <ul className="mt-4 flex flex-wrap gap-2">
        {clarification.options.map((option) => (
          <li key={option.id}>
            <button
              type="button"
              disabled={pending !== null}
              onClick={async () => {
                setPending(option.id);
                try {
                  await onChoose(option.id);
                } finally {
                  setPending(null);
                }
              }}
              className="inline-flex h-11 items-center gap-2 rounded-lg border border-line px-4 font-medium hover:border-accent hover:text-accent disabled:opacity-50"
            >
              {option.label}
              {option.company && (
                <span className="text-sm font-normal text-muted">{option.company.stockCode}</span>
              )}
              {pending === option.id && <span className="text-sm text-muted">분석하는 중…</span>}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm text-muted">골라도 질문 수는 더 차감되지 않습니다.</p>
    </section>
  );
}
