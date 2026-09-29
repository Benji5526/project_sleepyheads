import Link from "next/link";
import { DATA_SOURCES, INVESTMENT_NOTICE, NON_COMMERCIAL_NOTICE } from "@/components/legal/notices";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 text-sm leading-6 text-muted sm:px-6 md:grid-cols-[3fr_2fr]">
        <div className="space-y-3">
          <p>
            <strong className="font-semibold text-ink">투자 유의</strong> {INVESTMENT_NOTICE}
          </p>
          <p>
            <strong className="font-semibold text-ink">비상업 서비스</strong>{" "}
            {NON_COMMERCIAL_NOTICE}
          </p>
        </div>
        <div>
          <h2 className="font-semibold text-ink">데이터 출처</h2>
          <dl className="mt-2 space-y-1.5">
            {DATA_SOURCES.map((source) => (
              <div key={source.name} className="grid grid-cols-[3.5rem_1fr] gap-2">
                <dt className="text-ink">{source.name}</dt>
                <dd>{source.detail}</dd>
              </div>
            ))}
          </dl>
          <nav aria-label="약관" className="mt-4 flex gap-4">
            <Link href="/terms" className="underline underline-offset-4 hover:text-ink">
              이용약관
            </Link>
            <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
              개인정보 처리방침
            </Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
