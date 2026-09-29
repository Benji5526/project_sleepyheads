import type { ResultObject } from "@/contracts";
import { periodLabel } from "@/components/charts/chartData";

/** 분석 기준 바 (PRD F-V2): 기업, 기간(선정 이유), 기준 보고서, 재무제표, 계산식 버전, 주가 기준일 */
export function BasisBar({ result, groupBy }: { result: ResultObject; groupBy?: string }) {
  const { basis } = result;
  const { target, period } = basis;
  const fsDivs = new Set(Object.values(result.figures).map((f) => f.basis.fsDiv));
  const fsLabel = fsDivs.size > 1 ? "연결·별도 혼합" : fsDivs.has("OFS") ? "별도" : "연결";
  const range =
    groupBy === "year"
      ? `${period.from.slice(0, 4)}~${period.to.slice(0, 4)}년`
      : `${periodLabel(period.from)} ~ ${periodLabel(period.to)}`;

  // 계산 방식이 달라지는 경우는 눈에 띄게 따로 표시한다 (WU-113 완료조건)
  // 서버가 basis.flags에 같은 문구를 넣어 보내도 한 번만 보인다
  const badges = [
    ...new Set([
      ...(target.fiscalMonth !== 12 ? [`${target.fiscalMonth}월 결산 — 달력 분기로 환산`] : []),
      ...(fsDivs.has("OFS") ? ["별도 기준"] : []),
      ...(period.clipped ? ["조회 가능 범위로 기간을 줄임"] : []),
      ...basis.flags,
    ]),
  ];

  const items: { term: string; detail: React.ReactNode }[] = [
    {
      term: "기업",
      detail: (
        <>
          {target.name}{" "}
          <span className="text-muted">
            {target.stockCode} {target.market === "KOSPI" ? "코스피" : "코스닥"}
          </span>
        </>
      ),
    },
    {
      term: "기간",
      detail: (
        <>
          {range} <span className="text-muted">({period.reason})</span>
        </>
      ),
    },
    {
      term: "기준 보고서",
      detail:
        basis.reports.length > 2
          ? `${basis.reports[0]} 외 ${basis.reports.length - 1}건`
          : basis.reports.join(", "),
    },
    { term: "재무제표", detail: fsLabel },
    { term: "계산식", detail: basis.calcVersion },
    ...(basis.priceDate ? [{ term: "주가 기준일", detail: `${basis.priceDate} 종가` }] : []),
  ];

  return (
    <div className="rounded-xl border border-line bg-surface">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-3 lg:flex lg:flex-wrap lg:gap-x-8">
        {items.map((item) => (
          <div key={item.term} className="min-w-0">
            <dt className="text-xs text-muted">{item.term}</dt>
            <dd
              className="mt-0.5 font-medium"
              title={item.term === "기준 보고서" ? basis.reports.join(", ") : undefined}
            >
              {item.detail}
            </dd>
          </div>
        ))}
      </dl>
      {badges.length > 0 && (
        <ul className="flex flex-wrap gap-2 border-t border-line px-4 py-3">
          {badges.map((b) => (
            <li key={b} className="rounded-md bg-notice-bg px-2 py-0.5 text-sm text-notice-ink">
              {b}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
