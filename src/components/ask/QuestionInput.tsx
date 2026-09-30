"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { CompanyRef } from "@/contracts";
import { searchCompanies } from "@/lib/api-client/analysis";

const MAX_LENGTH = 500;

/** 커서 바로 앞의 낱말 (띄어쓰기 기준). 커서가 낱말 중간에 있으면 찾지 않는다 */
export function wordBeforeCaret(
  text: string,
  caret: number,
): { word: string; start: number } | null {
  const after = text.slice(caret, caret + 1);
  if (after && !/\s/.test(after)) return null;
  const match = /(\S+)$/.exec(text.slice(0, caret));
  if (!match) return null;
  return { word: match[1], start: caret - match[1].length };
}

/**
 * 글자를 넣으려는 키인가 (비로그인 잠금용). 새로고침(F5·Ctrl+R)·찾기·화살표·Esc 같은 키는 브라우저·화면 읽기
 * 프로그램 동작 그대로 둔다. "Process"는 한글 입력기가 조합 중에 보내는 키 이름이다
 */
function isTypingKey(event: React.KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return event.key.length === 1 || ["Enter", "Backspace", "Delete", "Process"].includes(event.key);
}

export function QuestionInput({
  value,
  onChange,
  onSubmit,
  disabled,
  locked,
  onLocked,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
  /** 비로그인: 입력 대신 onLocked를 부른다 (PRD F-G3). 키보드로 옮겨 다니는 Tab은 그대로 둔다 */
  locked?: boolean;
  onLocked?: () => void;
  label: string;
}) {
  const inputId = useId();
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const [results, setResults] = useState<CompanyRef[]>([]);
  const [active, setActive] = useState(0);
  const [dismissedWord, setDismissedWord] = useState<string | null>(null);

  const current = wordBeforeCaret(value, caret);
  const query = current && current.word !== dismissedWord ? current.word.slice(0, 30) : "";
  const open = results.length > 0 && query !== "" && !disabled;

  // 입력이 멈추면(0.18초) 커서 앞 낱말로 기업을 찾는다. 늦게 온 이전 응답은 버린다
  useEffect(() => {
    if (!query) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      searchCompanies(query)
        .then(({ data }) => {
          if (cancelled) return;
          // 이미 정확히 고른 기업명이면 목록을 다시 띄우지 않는다
          setResults(data.length === 1 && data[0].name === query ? [] : data);
          setActive(0);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        });
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  function pick(company: CompanyRef) {
    if (!current) return;
    const before = value.slice(0, current.start);
    const after = value.slice(caret).replace(/^\s*/, "");
    const next = `${before}${company.name} ${after}`;
    const nextCaret = before.length + company.name.length + 1;
    onChange(next);
    setResults([]);
    setDismissedWord(company.name);
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (locked) {
      if (isTypingKey(event)) {
        event.preventDefault();
        onLocked?.();
      }
      return;
    }
    // 한글 조합 중 Enter는 글자 확정용이므로 무시한다
    if (event.nativeEvent.isComposing) return;

    if (open) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActive((i) => (i + 1) % results.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActive((i) => (i - 1 + results.length) % results.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        pick(results[active]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setDismissedWord(query);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (value.trim()) onSubmit();
    }
  }

  const syncCaret = (e: React.SyntheticEvent<HTMLTextAreaElement>) =>
    setCaret(e.currentTarget.selectionStart);

  return (
    <div className="relative">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
        <label htmlFor={inputId}>{label}</label>
      </h1>
      <div className="mt-5 rounded-2xl border-2 border-line bg-surface transition-colors focus-within:border-accent">
        <textarea
          ref={textareaRef}
          id={inputId}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open ? `${listId}-${active}` : undefined}
          value={value}
          maxLength={MAX_LENGTH}
          rows={2}
          disabled={disabled}
          readOnly={locked}
          placeholder="예: 삼성전자의 최근 5년 매출액 추이를 보여줘"
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={syncCaret}
          onClick={locked ? onLocked : syncCaret}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(() => setResults([]), 120)}
          className="block w-full resize-none rounded-2xl bg-transparent px-5 pt-4 text-lg leading-8 outline-none placeholder:text-muted/70 disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-3 px-5 pb-3">
          <span className="text-xs text-muted">
            {value.length}/{MAX_LENGTH}
          </span>
          <button
            type="button"
            onClick={locked ? onLocked : onSubmit}
            disabled={disabled || (!locked && !value.trim())}
            className="h-10 rounded-lg bg-accent px-5 font-medium text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            질문하기
          </button>
        </div>
      </div>

      <ul
        id={listId}
        role="listbox"
        aria-label="기업 후보"
        hidden={!open}
        className="absolute inset-x-0 z-10 mt-2 overflow-hidden rounded-xl border border-line bg-surface shadow-lg"
      >
        {open &&
          results.map((company, i) => (
            <li
              key={company.stockCode}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(company);
              }}
              onMouseEnter={() => setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-2.5 ${
                i === active ? "bg-accent-soft" : ""
              }`}
            >
              <span className="font-medium">{company.name}</span>
              <span className="text-sm text-muted">
                {company.stockCode} {company.market === "KOSPI" ? "코스피" : "코스닥"}
              </span>
            </li>
          ))}
      </ul>
    </div>
  );
}
