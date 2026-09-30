"use client";

import { useState } from "react";
import type { Quarter } from "@/contracts";
import { EARLIEST_QUARTER, addQuarters, compareQuarters, quarterSpan } from "@/lib/ask/quarter";

// 보드 기간 필터 (TECH §12.4): 프리셋 4개 + 시작·끝 분기 직접 고르기. 달력 분기 기준.

export const PERIOD_PRESETS = [
  { label: "최근 4분기", quarters: 4 },
  { label: "최근 8분기", quarters: 8 },
  { label: "최근 3년", quarters: 12 },
  { label: "최근 5년", quarters: 20 },
] as const;

export interface Period {
  from: Quarter;
  to: Quarter;
}

/** 최신 분기에서 끝나는 N개 분기 */
export function presetPeriod(quarters: number, latest: Quarter): Period {
  return { from: addQuarters(latest, -(quarters - 1)), to: latest };
}

/** 2015Q1 ~ 최신 분기, 최근 것부터 (선택 목록용) */
function quarterOptions(latest: Quarter): Quarter[] {
  const count = quarterSpan(EARLIEST_QUARTER, latest);
  return Array.from({ length: count }, (_, i) => addQuarters(latest, -i));
}

const selectClass =
  "h-9 rounded-lg border border-line bg-surface px-2 text-sm disabled:opacity-50 focus:outline-2 focus:outline-accent";

export function PeriodFilter({
  period,
  latest,
  disabled,
  onApply,
}: {
  /** 지금 보드에 적용된 기간 */
  period: Period;
  latest: Quarter;
  disabled: boolean;
  onApply: (period: Period) => void;
}) {
  // 직접 고르기는 [기간 적용]을 눌러야 계산한다 (고르는 도중마다 다시 계산하지 않게)
  const [from, setFrom] = useState<Quarter>(period.from);
  const [to, setTo] = useState<Quarter>(period.to);
  const options = quarterOptions(latest);
  const reversed = compareQuarters(from, to) > 0;
  const unchanged = from === period.from && to === period.to;

  const isPreset = (quarters: number) => {
    const p = presetPeriod(quarters, latest);
    return p.from === period.from && p.to === period.to;
  };

  function pickPreset(quarters: number) {
    const next = presetPeriod(quarters, latest);
    setFrom(next.from);
    setTo(next.to);
    onApply(next);
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold">기간</legend>
      <div className="flex flex-wrap gap-2">
        {PERIOD_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            aria-pressed={isPreset(preset.quarters)}
            onClick={() => pickPreset(preset.quarters)}
            className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-50 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent"
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <label className="space-y-1 text-xs text-muted">
          <span className="block">시작 분기</span>
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value as Quarter)}
            className={selectClass}
          >
            {options.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <span aria-hidden="true" className="pb-2 text-muted">
          ~
        </span>
        <label className="space-y-1 text-xs text-muted">
          <span className="block">끝 분기</span>
          <select
            value={to}
            onChange={(e) => setTo(e.target.value as Quarter)}
            className={selectClass}
          >
            {options.map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => onApply({ from, to })}
          disabled={reversed || unchanged}
          className="inline-flex h-9 items-center rounded-lg border border-line px-3 text-sm font-medium hover:border-accent hover:text-accent disabled:opacity-50"
        >
          기간 적용
        </button>
      </div>
      {reversed && (
        <p role="alert" className="text-sm text-notice-ink">
          시작 분기가 끝 분기보다 늦습니다. 시작 분기를 앞으로 옮겨 주세요.
        </p>
      )}
    </fieldset>
  );
}
