// Figure.display 포맷 (TECH §12.3 "차트·표에 서버가 포맷한 글자"). 화면은 이 문자열을 그대로 보여준다.
import type { ReprtCode } from "@/lib/financials/types";

const JO = BigInt(1_000_000_000_000);
const EOK = BigInt(100_000_000);
const MAN = BigInt(10_000);
const ZERO = BigInt(0);

/** "5조 4,210억 원" / "301조 5,000억 원" / "9,000만 원" / "1,200원" 처럼 억 단위까지 정밀하게 표시한다. */
export function formatKrw(amount: bigint): string {
  const sign = amount < ZERO ? "-" : "";
  const abs = amount < ZERO ? -amount : amount;

  const jo = abs / JO;
  const afterJo = abs % JO;
  if (jo > ZERO) {
    const eok = afterJo / EOK;
    return `${sign}${jo.toLocaleString("ko-KR")}조${eok > ZERO ? ` ${eok.toLocaleString("ko-KR")}억` : ""} 원`;
  }

  const eok = abs / EOK;
  if (eok > ZERO) return `${sign}${eok.toLocaleString("ko-KR")}억 원`;

  const man = abs / MAN;
  if (man > ZERO) return `${sign}${man.toLocaleString("ko-KR")}만 원`;

  return `${sign}${abs.toLocaleString("ko-KR")}원`;
}

/** "+12.3%" / "-14.1%" / "0.0%". */
export function formatPercent(value: number): string {
  // 먼저 반올림한다 — -0.04가 "-0.0%", 0.04가 "+0.0%"로 보이지 않게
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return "0.0%";
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${rounded.toFixed(1)}%`;
}

export function formatTimes(value: number): string {
  return `${value.toFixed(2)}배`;
}

export function formatCount(value: number): string {
  return `${value.toLocaleString("ko-KR")}건`;
}

const REPORT_LABEL_BY_CODE: Record<ReprtCode, string> = {
  "11013": "1분기보고서",
  "11012": "반기보고서",
  "11014": "3분기보고서",
  "11011": "사업보고서",
};

/** "2026 반기보고서" (DataBasis.reports·Figure.basis.report용). */
export function reportDisplayName(bsnsYear: number, reprtCode: ReprtCode): string {
  return `${bsnsYear} ${REPORT_LABEL_BY_CODE[reprtCode]}`;
}

/** 4분기는 "연간 − 3분기 누적"이라 사업보고서·3분기보고서 두 개가 근거다. */
export function fourthQuarterReportDisplayName(bsnsYear: number): string {
  return `${reportDisplayName(bsnsYear, "11011")}·${reportDisplayName(bsnsYear, "11014")}`;
}
