"use client";

import { useEffect, useId, useState } from "react";
import type { CompanyRef } from "@/contracts";
import { searchCompanies } from "@/lib/api-client/analysis";
import { MAX_BOARD_PEERS } from "@/lib/api-client/boards";

// 보드 비교 기업 필터 (TECH §12.4): 기업 찾기(S1)로 추가, 칩의 [×]로 빼기. 최대 5곳.

export interface Peer {
  stockCode: string;
  /** 이름을 아직 모르면(다시 열었을 때 찾기 전) 종목코드를 보여 준다 */
  name: string;
}

export function PeerFilter({
  peers,
  targetStockCode,
  disabled,
  onChange,
}: {
  peers: Peer[];
  /** 분석 대상 기업 — 비교 기업으로 넣지 않는다 */
  targetStockCode: string;
  disabled: boolean;
  onChange: (peers: Peer[], added?: CompanyRef) => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CompanyRef[]>([]);
  const full = peers.length >= MAX_BOARD_PEERS;
  const q = query.trim().slice(0, 30);

  // 입력이 멈추면(0.2초) 기업을 찾는다. 늦게 온 이전 응답은 버린다 (QuestionInput과 같은 방식)
  useEffect(() => {
    if (!q || full) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchCompanies(q)
        .then(({ data }) => {
          if (!cancelled) setResults(data);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [q, full]);

  const taken = new Set([targetStockCode, ...peers.map((p) => p.stockCode)]);
  const candidates = q && !full ? results.filter((c) => !taken.has(c.stockCode)) : [];

  function add(company: CompanyRef) {
    setQuery("");
    setResults([]);
    onChange([...peers, { stockCode: company.stockCode, name: company.name }], company);
  }

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="text-sm font-semibold">
        비교 기업{" "}
        <span className="font-normal text-muted">
          ({peers.length}/{MAX_BOARD_PEERS})
        </span>
      </legend>

      {peers.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="고른 비교 기업">
          {peers.map((peer) => (
            <li
              key={peer.stockCode}
              className="inline-flex h-8 items-center gap-1 rounded-full border border-line bg-paper pl-3 pr-1 text-sm"
            >
              {peer.name}
              <button
                type="button"
                onClick={() => onChange(peers.filter((p) => p.stockCode !== peer.stockCode))}
                aria-label={`${peer.name} 빼기`}
                className="inline-flex size-6 items-center justify-center rounded-full text-muted hover:bg-accent-soft hover:text-accent disabled:opacity-50"
              >
                <span aria-hidden="true">×</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">아직 고른 비교 기업이 없습니다.</p>
      )}

      <div className="relative max-w-xs">
        <label htmlFor={inputId} className="sr-only">
          비교 기업 찾기
        </label>
        <input
          id={inputId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={disabled || full}
          placeholder={full ? "최대 5곳까지 골랐습니다" : "기업 이름이나 종목코드로 찾기"}
          autoComplete="off"
          className="h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm placeholder:text-muted disabled:opacity-50 focus:outline-2 focus:outline-accent"
        />
        {candidates.length > 0 && (
          <ul
            aria-label="찾은 기업"
            className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-line bg-surface py-1 shadow-lg"
          >
            {candidates.map((c) => (
              <li key={c.stockCode}>
                <button
                  type="button"
                  onClick={() => add(c)}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-accent-soft"
                >
                  <span>{c.name}</span>
                  <span className="text-xs text-muted">{c.stockCode}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {full && (
        <p className="text-sm text-muted" data-testid="peers-full">
          비교 기업은 최대 {MAX_BOARD_PEERS}곳까지입니다. 다른 기업을 넣으려면 먼저 하나를 빼
          주세요.
        </p>
      )}
    </fieldset>
  );
}
