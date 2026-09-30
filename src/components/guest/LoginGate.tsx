"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import type { SyntheticEvent } from "react";

// 누르면 로그인 안내를 띄울 요소: 버튼·링크·접기/펼치기·입력창 (PRD F-G3)
const INTERACTIVE = "a, button, summary, textarea, input, select, [role='button'], [role='option']";

/**
 * 비로그인 화면의 기능 잠금 (PRD F-G2·F-G3). 안에 든 버튼·링크·입력창을 누르면 원래 동작 대신
 * onBlocked를 부른다. 스크롤과 차트에 마우스를 올려 수치 보기(툴팁)는 누르는 동작이 아니라 그대로 된다.
 */
export function LoginGate({
  onBlocked,
  children,
  className,
}: {
  onBlocked: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  // 캡처 단계에서 먼저 가로채야 안쪽 버튼의 onClick·링크 이동·접기가 실행되지 않는다
  function block(event: SyntheticEvent<HTMLDivElement>) {
    const el = (event.target as HTMLElement).closest(INTERACTIVE);
    if (!el || !event.currentTarget.contains(el)) return;
    event.preventDefault();
    event.stopPropagation();
    onBlocked();
  }

  return (
    <div
      className={className}
      onClickCapture={block}
      // 가운데 버튼 클릭(새 탭 열기)과 오른쪽 클릭 메뉴("새 탭에서 열기")도 막는다
      onAuxClickCapture={block}
      onContextMenuCapture={block}
    >
      {children}
    </div>
  );
}

/** 로그인 안내 창. 브라우저 기본 <dialog>라 Esc로 닫히고, 열린 동안 뒤 화면은 누를 수 없다 */
export function LoginPromptDialog({
  open,
  onClose,
  next = "/",
}: {
  open: boolean;
  onClose: () => void;
  next?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  // 창 안에서 누른 채(글자 선택 등) 바깥에서 뗀 경우는 닫지 않도록, 누른 곳을 기억한다
  const pressedOnBackdrop = useRef(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      // 창 바깥(어두운 배경)을 누르면 닫는다. 안쪽 여백은 모두 div라, dialog 자체가 눌렸다면 바깥이다
      onMouseDown={(event) => {
        pressedOnBackdrop.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (pressedOnBackdrop.current && event.target === event.currentTarget) onClose();
        pressedOnBackdrop.current = false;
      }}
      aria-labelledby="login-prompt-title"
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40"
    >
      <div className="p-6">
        <h2 id="login-prompt-title" className="text-lg font-semibold">
          로그인이 필요합니다
        </h2>
        <p className="mt-2 leading-7 text-muted">
          아래 예시는 둘러보기만 할 수 있습니다. 구글 계정으로 로그인하면 원하는 기업을 직접
          질문하고, 표로 보기·공시 원문 같은 기능도 쓸 수 있습니다.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-line px-4 font-medium hover:border-accent hover:text-accent"
          >
            닫기
          </button>
          <Link
            href={`/login?next=${encodeURIComponent(next)}`}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-accent px-4 font-medium text-accent-ink hover:opacity-90"
          >
            로그인하러 가기
          </Link>
        </div>
      </div>
    </dialog>
  );
}
