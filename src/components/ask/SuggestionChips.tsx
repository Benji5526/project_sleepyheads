import Link from "next/link";

/** 누르면 대기화면 입력창에 질문이 채워지는 칩 (/?q=…) */
export function SuggestionChips({
  questions,
  onPick,
  className = "",
}: {
  questions: string[];
  /** 주면 링크 대신 이 함수를 부른다 (같은 화면에서 입력창만 채울 때) */
  onPick?: (question: string) => void;
  className?: string;
}) {
  const chip =
    "inline-flex min-h-9 items-center rounded-full border border-line bg-surface px-3.5 py-1.5 text-left text-sm hover:border-accent hover:text-accent";
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`}>
      {questions.map((q) => (
        <li key={q}>
          {onPick ? (
            <button type="button" className={chip} onClick={() => onPick(q)}>
              {q}
            </button>
          ) : (
            <Link href={`/?q=${encodeURIComponent(q)}`} className={chip}>
              {q}
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}
