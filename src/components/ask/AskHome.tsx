"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { GuestExampleSection } from "@/components/guest/GuestExampleSection";
import { LoginPromptDialog } from "@/components/guest/LoginGate";
import { useSession } from "@/components/session/SessionProvider";
import { ask } from "@/lib/api-client/analysis";
import { ApiRequestError } from "@/lib/api-client/errors";
import { ErrorCard } from "./ErrorCard";
import { describeError, type ErrorNotice } from "./errorMessages";
import { HOME_CHIPS } from "./examples";
import { QuestionInput } from "./QuestionInput";
import { SuggestionChips } from "./SuggestionChips";

/**
 * `/` 대기화면. 로그인 후: 입력창 + 예시 질문 칩만 둔다 (WU-113, PRD F-Q1).
 * 비로그인: 그 아래에 SK하이닉스 예시 분석을 붙이고, 모든 기능은 로그인 안내 창을 띄운다 (WU-115, PRD F-G1~G3).
 */
export function AskHome() {
  const router = useRouter();
  const params = useSearchParams();
  const { status, refresh, applyRemaining } = useSession();
  const [question, setQuestion] = useState(() => params.get("q") ?? "");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<ErrorNotice | null>(null);
  const [loginPrompt, setLoginPrompt] = useState(false);
  const anonymous = status === "anonymous";
  const promptLogin = () => setLoginPrompt(true);
  // 연결이 끊겨 다시 보낼 때는 같은 멱등키를 써서 두 번 처리되지 않게 한다 (API_SPEC §1.5)
  const retryKey = useRef<{ question: string; key: string } | null>(null);

  async function submit() {
    const trimmed = question.trim();
    if (!trimmed || pending) return;
    if (anonymous) {
      promptLogin();
      return;
    }

    const key = retryKey.current?.question === trimmed ? retryKey.current.key : crypto.randomUUID();
    setPending(true);
    setNotice(null);
    try {
      const { data, questionsRemaining } = await ask(trimmed, key);
      retryKey.current = null;
      applyRemaining(questionsRemaining);
      router.push(`/p/${data.projectId}?analysis=${data.analysisId}`);
    } catch (error) {
      setPending(false);
      if (error instanceof ApiRequestError && error.code === "UNAUTHORIZED") {
        router.push(`/login?next=${encodeURIComponent("/")}`);
        return;
      }
      if (error instanceof ApiRequestError && error.code === "TERMS_REQUIRED") {
        router.push(`/onboarding?next=${encodeURIComponent("/")}`);
        return;
      }
      const code = error instanceof ApiRequestError ? error.code : null;
      const status = error instanceof ApiRequestError ? error.httpStatus : null;
      // 연결 끊김·"같은 질문 처리 중"(409)·서버 오류(5xx, Vercel 시간 초과 504 포함)면 다음에 누를 때도
      // 같은 키를 보낸다 — 새 키면 질문 수가 또 차감되고, 서버가 끊긴 질문을 이어받을 수 없다 (PR #26)
      const keepKey =
        code === "NETWORK_ERROR" || code === "INVALID_STATE" || (status !== null && status >= 500);
      retryKey.current = keepKey ? { question: trimmed, key } : null;
      setNotice(
        code === "INVALID_STATE"
          ? {
              ...describeError(error),
              title: "같은 질문을 처리하고 있습니다",
              body: "앞서 보낸 질문이 아직 처리 중입니다. 잠시 후 다시 눌러 주세요. 질문 수는 한 번만 차감됩니다.",
              requestId: null,
            }
          : describeError(error),
      );
      void refresh();
    }
  }

  const askArea = (
    <>
      <QuestionInput
        label="어느 회사의 무엇이 궁금하세요?"
        value={question}
        onChange={setQuestion}
        onSubmit={() => void submit()}
        disabled={pending}
        locked={anonymous}
        onLocked={promptLogin}
      />

      {pending ? (
        <p role="status" className="mt-5 flex items-center gap-3 text-muted">
          <span
            aria-hidden="true"
            className="size-4 animate-spin rounded-full border-2 border-line border-t-accent"
          />
          질문을 해석하고 공시 데이터로 계산하는 중입니다. 보통 10초 안에 끝납니다.
        </p>
      ) : (
        // 칩은 입력창만 채운다. 바로 보내면 누를 때마다 질문 수가 차감되기 때문
        <SuggestionChips
          questions={HOME_CHIPS}
          onPick={anonymous ? promptLogin : setQuestion}
          className="mt-5"
        />
      )}

      {anonymous && !pending && (
        <p className="mt-4 text-sm text-muted">질문하려면 먼저 로그인해야 합니다.</p>
      )}

      {notice && (
        <div className="mt-8">
          <ErrorCard notice={notice} />
        </div>
      )}
    </>
  );

  // 로그인 상태를 확인하는 동안에도 예시를 미리 받아 둔다 — 비로그인으로 판정되면 바로 보이게.
  // 입력창은 어느 상태든 같은 자리에 두어, 판정이 끝날 때 다시 그려지며 입력 위치를 잃지 않게 한다
  const guestPossible = status === "loading" || anonymous;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 sm:px-6">
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center py-16 sm:py-24">
        {askArea}
      </div>
      {guestPossible && (
        // 비로그인: 입력창 아래로 예시 분석을 펼친다
        <div hidden={!anonymous} className="border-t border-line pt-10 pb-16">
          <GuestExampleSection visible={anonymous} onBlocked={promptLogin} />
        </div>
      )}
      {anonymous && <LoginPromptDialog open={loginPrompt} onClose={() => setLoginPrompt(false)} />}
    </main>
  );
}
