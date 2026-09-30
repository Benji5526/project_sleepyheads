"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { Usage } from "@/contracts";
import { ApiRequestError } from "@/lib/api-client/errors";
import { getMe, getUsage, signOut as apiSignOut } from "@/lib/api-client/session";
import type { Me } from "@/lib/api-client/types";

type SessionStatus = "loading" | "anonymous" | "needs_terms" | "ready";

interface SessionSnapshot {
  status: SessionStatus;
  me: Me | null;
  usage: Usage | null;
}

interface SessionValue extends SessionSnapshot {
  /** 서버에서 로그인 상태·사용량을 다시 읽는다 */
  refresh: () => Promise<void>;
  /** 응답 헤더 X-Questions-Remaining 값으로 남은 질문 수만 바꾼다 */
  applyRemaining: (remaining: number | null) => void;
  signOut: () => Promise<void>;
}

const LOADING: SessionSnapshot = { status: "loading", me: null, usage: null };
const ANONYMOUS: SessionSnapshot = { status: "anonymous", me: null, usage: null };

async function loadSession(): Promise<SessionSnapshot> {
  try {
    const { data: me } = await getMe();
    if (!me.termsAgreed) return { status: "needs_terms", me, usage: null };
    const usageRes = await getUsage().catch(() => null);
    return { status: "ready", me, usage: usageRes?.data ?? null };
  } catch (error) {
    // 로그인 안 됨(401)이거나, 서버 API가 아직 없을 때는 비로그인으로 본다
    if (!(error instanceof ApiRequestError)) console.error(error);
    return ANONYMOUS;
  }
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<SessionSnapshot>(LOADING);

  useEffect(() => {
    // 처음 화면이 뜰 때 한 번 로그인 상태를 읽는다
    let active = true;
    void loadSession().then((next) => {
      if (active) setSnapshot(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setSnapshot(await loadSession());
  }, []);

  const applyRemaining = useCallback((remaining: number | null) => {
    if (remaining === null) return;
    setSnapshot((prev) =>
      prev.usage
        ? {
            ...prev,
            usage: {
              ...prev.usage,
              questionsUsed: Math.max(0, prev.usage.questionsLimit - remaining),
            },
          }
        : prev,
    );
  }, []);

  const signOut = useCallback(async () => {
    await apiSignOut();
    // 화면 상태를 손으로 바꾸지 않고 첫 화면을 새로 불러온다: 회원 화면에 남아 있던 내용이 모두 지워지고,
    // replace라 '뒤로 가기'로 이 화면에 돌아오지 않는다. 새 화면이 로그인 상태를 다시 읽는다
    window.location.replace("/");
  }, []);

  const value = useMemo(
    () => ({ ...snapshot, refresh, applyRemaining, signOut }),
    [snapshot, refresh, applyRemaining, signOut],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession은 SessionProvider 안에서만 쓸 수 있습니다.");
  return value;
}
