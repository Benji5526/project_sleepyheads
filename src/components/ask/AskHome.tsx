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
      retryKey.current =
        error instanceof ApiRequestError && error.code === "NETWORK_ERROR"
          ? { question: trimmed, key }
          : null;
      setNotice(describeError(error));
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

  if (!anonymous) {
    return (
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16 sm:py-24">
        {askArea}
      </main>
    );
  }

  // 비로그인: 입력창은 위에 두고 그 아래로 예시 분석을 펼친다
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto max-w-2xl">{askArea}</div>
      <div className="mt-14 border-t border-line pt-10 sm:mt-20">
        <GuestExampleSection onBlocked={promptLogin} />
      </div>
      <LoginPromptDialog open={loginPrompt} onClose={() => setLoginPrompt(false)} />
    </main>
  );
}
