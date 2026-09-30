"use client";

import { useEffect, useState } from "react";
import type { GuestExample } from "@/contracts";
import { ResultView } from "@/components/result/ResultView";
import { getGuestExample } from "@/lib/api-client/guest";
import { LoginGate } from "./LoginGate";

const DATE = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "long",
  day: "numeric",
});

/**
 * 비로그인 첫 화면 아래의 SK하이닉스 예시 분석 (PRD F-G1, WU-115).
 * 서버에 미리 저장된 결과만 받아 오므로 외부 API·AI를 부르지 않는다. 예시가 없거나 못 받으면 아무것도 안 보인다.
 */
export function GuestExampleSection({
  visible,
  onBlocked,
}: {
  /** false = 로그인 확인 중. 데이터는 미리 받아 두되, 크기가 0인 숨은 칸에 차트를 그리지는 않는다 */
  visible: boolean;
  onBlocked: () => void;
}) {
  const [example, setExample] = useState<GuestExample | null>(null);

  useEffect(() => {
    let active = true;
    getGuestExample()
      .then((data) => {
        if (active) setExample(data);
      })
      // 예시는 덤이다. 못 받아도 입력창과 로그인 안내는 그대로 쓸 수 있다
      .catch((error: unknown) => console.error("비로그인 예시를 불러오지 못했습니다", error));
    return () => {
      active = false;
    };
  }, []);

  if (!example || !visible) return null;

  return (
    <section
      aria-labelledby="guest-example-title"
      className="space-y-5"
      data-testid="guest-example"
    >
      <div className="space-y-2">
        <p className="inline-flex rounded-md bg-accent-soft px-2 py-0.5 text-sm font-medium text-accent">
          예시 분석
        </p>
        <h2
          id="guest-example-title"
          className="text-xl font-bold leading-snug tracking-tight sm:text-2xl"
        >
          {example.question}
        </h2>
        <p className="text-sm text-muted">
          로그인 없이 둘러볼 수 있게 미리 만들어 둔 결과입니다 (
          {DATE.format(new Date(example.generatedAt))} 기준). 차트에 마우스를 올리면 수치를 볼 수
          있습니다.
        </p>
      </div>

      <LoginGate onBlocked={onBlocked}>
        <ResultView result={example.result} explanation={example.explanation} />
      </LoginGate>
    </section>
  );
}
