"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { splitTerms, type GlossaryEntry } from "./terms";

const GAP = 6;
const EDGE = 8;

/**
 * 재무 용어 한 줄 설명 (PRD F-Z5). 마우스를 올리거나, Tab으로 옮겨 오거나, 누르면(휴대폰 탭) 설명이 뜬다.
 * - 설명은 버튼의 aria-describedby로 이어져 화면 낭독기도 용어와 함께 읽는다.
 * - 누르면 고정되고 한 번 더 누르거나 바깥을 누르면 닫힌다. Esc는 언제든 닫는다.
 * - 설명 칸은 화면 기준(fixed)으로 띄워, 가로 스크롤 표 안에서도 잘리지 않는다.
 */
export function Term({ entry, children }: { entry: GlossaryEntry; children?: React.ReactNode }) {
  const tipId = `${useId()}-term`;
  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  function close() {
    setOpen(false);
    setPinned(false);
  }

  // 열려 있는 동안 버튼 바로 아래(자리가 없으면 위)에 둔다. 화면 밖으로 나가지 않게 좌우를 맞춘다
  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const button = buttonRef.current;
      const tip = tipRef.current;
      if (!button || !tip) return;
      const b = button.getBoundingClientRect();
      const w = tip.offsetWidth;
      const h = tip.offsetHeight;
      const left = Math.max(
        EDGE,
        Math.min(b.left + b.width / 2 - w / 2, window.innerWidth - w - EDGE),
      );
      const below = b.bottom + GAP;
      const top =
        below + h > window.innerHeight - EDGE && b.top - GAP - h > EDGE ? b.top - GAP - h : below;
      tip.style.left = `${left}px`;
      tip.style.top = `${top}px`;
      tip.style.visibility = "visible";
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  // Esc로 닫기, 고정된 설명은 바깥을 누르면 닫기
  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") close();
    }
    function onPointer(event: PointerEvent) {
      if (!buttonRef.current?.contains(event.target as Node)) close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  return (
    <span className="inline">
      <button
        ref={buttonRef}
        type="button"
        aria-describedby={tipId}
        data-term={entry.term}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => {
          if (!pinned) setOpen(false);
        }}
        onFocus={() => setOpen(true)}
        onBlur={close}
        onClick={() => {
          const next = !pinned;
          setPinned(next);
          setOpen(next);
        }}
        className="cursor-help rounded-sm underline decoration-muted decoration-dotted underline-offset-4 hover:decoration-accent"
      >
        {children ?? entry.term}
      </button>
      <span
        ref={tipRef}
        id={tipId}
        role="tooltip"
        hidden={!open}
        style={{ visibility: "hidden" }}
        className="pointer-events-none fixed left-0 top-0 z-50 w-max max-w-64 rounded-lg border border-line bg-surface px-3 py-2 text-left text-sm font-normal leading-5 text-ink shadow-md"
      >
        <span className="font-semibold">{entry.term}</span> — {entry.description}
      </span>
    </span>
  );
}

/** 글자 안의 재무 용어만 Term으로 바꿔 보여 준다 ("매출액 전년 동기 대비" → [매출액] [전년 동기 대비]) */
export function TermText({ text }: { text: string }) {
  return (
    <>
      {splitTerms(text).map((segment, i) =>
        segment.entry ? (
          <Term key={i} entry={segment.entry}>
            {segment.text}
          </Term>
        ) : (
          segment.text
        ),
      )}
    </>
  );
}
