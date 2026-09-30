"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { BoardFilters, BoardView, CompanyRef, Explanation, ResultObject } from "@/contracts";
import { ErrorCard } from "@/components/ask/ErrorCard";
import type { ErrorNotice } from "@/components/ask/errorMessages";
import { ResultView } from "@/components/result/ResultView";
import { useSession } from "@/components/session/SessionProvider";
import { searchCompanies } from "@/lib/api-client/analysis";
import { getBoard, rewriteExplanation, updateBoardFilters } from "@/lib/api-client/boards";
import { latestAvailableQuarter } from "@/lib/ask/quarter";
import { describeBoardError, describeRewriteError } from "./boardErrors";
import { PeerFilter, type Peer } from "./PeerFilter";
import { PeriodFilter, type Period } from "./PeriodFilter";
import { RewriteContext, type RewriteControl } from "./rewrite-context";

/**
 * 분석 보드 (WU-401, TECH §12.4): 필터 막대(기간·비교 기업) + 결과 화면.
 * 필터를 바꾸면 B2로 서버가 다시 계산하고, 돌아온 결과를 **결과 화면(ResultView) 그대로** 그린다
 * — 보드의 모든 차트·표가 같은 조건으로 바뀐다. 필터를 바꾼 뒤 분석 글은 "원래 조건 기준"이고,
 * [설명 다시 쓰기](Q9, 질문 1회)로 새 조건에 맞게 다시 쓸 수 있다.
 * 보드 ID = 분석 ID. 처음 열 때 B1로 저장된 필터를 불러온다 (다시 열어도 유지).
 */
export function BoardPanel({
  analysisId,
  result,
  explanation: initialExplanation,
  groupBy,
  peers: initialPeers = [],
}: {
  analysisId: string;
  /** 분석의 원래 결과 — 보드를 불러오기 전과 불러오지 못했을 때 보여 준다 */
  result: ResultObject;
  explanation: Explanation | null;
  groupBy?: string;
  /** 원래 질문의 비교 기업 (analysis.request.peers) — 필터를 바꾼 적 없을 때의 비교 기업 칩 */
  peers?: CompanyRef[];
}) {
  const { applyRemaining } = useSession();
  const latest = useMemo(() => latestAvailableQuarter(), []);

  const [board, setBoard] = useState<BoardView>({
    id: analysisId,
    analysisId,
    filters: {},
    result,
    explanationStatus: "ready",
  });
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<ErrorNotice | null>(null);
  const [explanation, setExplanation] = useState(initialExplanation);
  const [rewritePhase, setRewritePhase] = useState<RewriteControl["phase"]>("idle");
  const [rewriteNotice, setRewriteNotice] = useState<string | null>(null);
  const [rewritten, setRewritten] = useState(false);
  /** 종목코드 → 기업 이름 (칩에 이름을 보여 주려고) */
  const [names, setNames] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialPeers.map((p) => [p.stockCode, p.name])),
  );

  // B1: 저장된 필터·결과를 불러온다. 보드가 없으면 서버가 빈 필터 + 원래 결과를 준다
  useEffect(() => {
    let cancelled = false;
    getBoard(analysisId)
      .then(({ data, questionsRemaining }) => {
        if (cancelled) return;
        setBoard(data);
        applyRemaining(questionsRemaining);
      })
      .catch(() => {
        if (cancelled) return;
        setNotice({
          title: "저장된 보드 조건을 불러오지 못했습니다",
          body: "원래 조건의 결과를 보여 드립니다. 필터를 바꾸면 다시 계산합니다.",
          charged: false,
          suggestions: [],
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [analysisId, applyRemaining]);

  const peerCodes = board.filters.peers ?? initialPeers.map((p) => p.stockCode);
  const unknownCodes = peerCodes.filter((code) => !names[code]);
  const unknownKey = unknownCodes.join(",");

  // 다시 열었을 때 이름을 모르는 비교 기업은 기업 찾기(S1)로 종목코드를 찾아 이름을 채운다
  useEffect(() => {
    if (!unknownKey) return;
    let cancelled = false;
    for (const code of unknownKey.split(",")) {
      searchCompanies(code)
        .then(({ data }) => {
          const found = data.find((c) => c.stockCode === code);
          if (!cancelled && found) setNames((prev) => ({ ...prev, [code]: found.name }));
        })
        .catch(() => {
          // 이름을 못 찾으면 종목코드를 그대로 보여 준다
        });
    }
    return () => {
      cancelled = true;
    };
  }, [unknownKey]);

  const period: Period = {
    from: board.filters.period?.from ?? board.result.basis.period.from,
    to: board.filters.period?.to ?? board.result.basis.period.to,
  };
  const peers: Peer[] = peerCodes.map((code) => ({ stockCode: code, name: names[code] ?? code }));

  async function apply(next: BoardFilters) {
    setPending(true);
    setNotice(null);
    setRewritten(false);
    try {
      const { data, questionsRemaining } = await updateBoardFilters(analysisId, next);
      rewriteKey.current = null;
      setBoard(data);
      setRewritePhase("idle");
      setRewriteNotice(null);
      applyRemaining(questionsRemaining);
    } catch (error) {
      setNotice(describeBoardError(error, latest));
    } finally {
      setPending(false);
    }
  }

  // 필터는 항상 기간·비교 기업을 함께 보낸다 (B2는 보낸 필터로 덮어쓴다)
  const applyPeriod = (p: Period) => void apply({ period: p, peers: peerCodes });
  const applyPeers = (next: Peer[], added?: CompanyRef) => {
    if (added) setNames((prev) => ({ ...prev, [added.stockCode]: added.name }));
    void apply({ period, peers: next.map((p) => p.stockCode) });
  };

  // 같은 [설명 다시 쓰기]를 다시 누르면(응답을 못 받은 경우 등) 같은 멱등키 — 서버가 두 번 차감하지 않는다.
  // 성공하거나 필터가 바뀌면 새 키
  const rewriteKey = useRef<string | null>(null);

  async function rewrite() {
    setRewritePhase("pending");
    setRewriteNotice(null);
    rewriteKey.current ??= crypto.randomUUID();
    try {
      const { data, questionsRemaining } = await rewriteExplanation(analysisId, rewriteKey.current);
      rewriteKey.current = null;
      setExplanation(data.explanation);
      setBoard((prev) => ({ ...prev, explanationStatus: "ready" }));
      setRewritten(true);
      applyRemaining(questionsRemaining);
      setRewritePhase("idle");
    } catch (error) {
      // AI 장애(503)면 서버가 차감을 취소하고 기존 설명을 그대로 둔다 — 화면도 그대로 둔다
      setRewriteNotice(describeRewriteError(error));
      setRewritePhase("idle");
    }
  }

  const rewriteControl: RewriteControl = {
    phase: rewritePhase,
    notice: rewriteNotice,
    open: () => {
      setRewriteNotice(null);
      setRewritePhase("confirm");
    },
    cancel: () => setRewritePhase("idle"),
    confirm: () => void rewrite(),
  };

  // 필터를 바꿨으면 분석 글은 원래 조건 기준 — 분석 글 위에 안내와 [설명 다시 쓰기]를 띄운다
  const shownExplanation =
    explanation && explanation.status === "ready" && board.explanationStatus === "stale"
      ? { ...explanation, status: "stale" as const }
      : explanation;

  const busy = loading || pending;

  return (
    <div className="space-y-4" data-testid="board">
      <section
        aria-label="보드 필터"
        className="space-y-4 rounded-xl border border-line bg-surface p-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">분석 보드 조건</h2>
          <p className="text-sm text-muted" data-testid="board-condition">
            {period.from}~{period.to} ·{" "}
            {peers.length > 0 ? `비교 기업 ${peers.length}곳` : "비교 기업 없음"}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <PeriodFilter
            key={`${period.from}-${period.to}`}
            period={period}
            latest={latest}
            disabled={busy}
            onApply={applyPeriod}
          />
          <PeerFilter
            peers={peers}
            targetStockCode={board.result.basis.target.stockCode}
            disabled={busy}
            onChange={applyPeers}
          />
        </div>
        <p className="text-xs text-muted">
          필터를 바꾸면 서버가 차트와 표를 모두 같은 조건으로 다시 계산합니다. AI를 쓰지 않으므로
          질문 수는 그대로입니다.
        </p>
        <p role="status" className="text-sm text-muted" aria-live="polite">
          {loading
            ? "저장된 보드 조건을 불러오는 중…"
            : pending
              ? "새 조건으로 다시 계산하는 중…"
              : rewritten
                ? "새 조건으로 분석 글을 다시 썼습니다."
                : ""}
        </p>
      </section>

      {notice && <ErrorCard notice={notice} />}

      <div aria-busy={pending} className={pending ? "opacity-60 transition-opacity" : undefined}>
        <RewriteContext.Provider value={rewriteControl}>
          <ResultView result={board.result} explanation={shownExplanation} groupBy={groupBy} />
        </RewriteContext.Provider>
      </div>
    </div>
  );
}
