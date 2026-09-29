import type { Disclosure } from "@/contracts";

/** 주요 공시 목록 (PRD F-E6): 태그·날짜·DART 원문 링크 */
export function DisclosureList({ disclosures }: { disclosures: Disclosure[] }) {
  if (disclosures.length === 0) return null;
  return (
    <section
      aria-labelledby="disclosures-title"
      className="rounded-xl border border-line bg-surface p-4 sm:p-5"
    >
      <h3 id="disclosures-title" className="font-semibold">
        주요 공시
      </h3>
      <ul className="mt-3 divide-y divide-line">
        {disclosures.map((d) => (
          <li key={d.rceptNo} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
            <time dateTime={d.date} className="text-sm text-muted">
              {d.date}
            </time>
            <span
              className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                d.importance === "high" ? "bg-accent-soft text-accent" : "bg-paper text-muted"
              }`}
            >
              {d.tag}
            </span>
            <a
              href={d.url}
              target="_blank"
              rel="noopener noreferrer"
              className="min-w-0 flex-1 underline-offset-4 hover:underline"
            >
              {d.title}
              {d.isCorrection && <span className="ml-1 text-sm text-muted">(정정)</span>}
              <span className="sr-only"> — DART 원문, 새 창</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
