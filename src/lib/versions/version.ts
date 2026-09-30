// WU-202 데이터 버전 (TECH §5.2): 분석이 쓴 데이터의 "지문"을 만드는 순수 함수들.
// 출처(보고서별 접수번호·연결/별도) + 계산식 버전 + 전처리 선택이 같으면 해시가 같고,
// 해시가 같으면 같은 숫자가 나온다 — 재실행은 이 출처의 원본 값만 다시 읽어 계산한다.
import { createHash } from "node:crypto";

import type { UUID } from "@/contracts";
import type { FsDiv, ReprtCode } from "@/lib/financials/types";
import type { ReportPin } from "@/lib/metrics/persist";
import type { PreprocessDecisions } from "@/lib/preprocess/types";

/**
 * 출처 한 줄 — 계산에 **실제로 쓴** 보고서 값의 연결/별도·접수번호.
 * `rceptNo`·`fsDiv`가 null이면 그 보고서는 전자공시에 없었다(013).
 */
export interface DataSource {
  corpCode: string;
  bsnsYear: number;
  reprtCode: ReprtCode;
  fsDiv: FsDiv | null;
  rceptNo: string | null;
  /**
   * 전처리 선택(최초 공시 사용·별도로 통일)으로 수집 당시 최신 값과 다른 것을 썼을 때만, 그 최신 값.
   * "새 데이터 있음" 판정은 이것과 비교한다 (고른 옛 값 때문에 늘 "새 데이터 있음"이 뜨지 않게).
   */
  collected?: { fsDiv: FsDiv; rceptNo: string };
}

export interface DataVersionContent {
  sources: DataSource[];
  calcVersion: string;
  /** 주가 기준일 (Step 5 WU-502). 지금은 늘 null */
  priceDate: string | null;
  decisions: PreprocessDecisions;
}

function compareSources(a: DataSource, b: DataSource): number {
  if (a.corpCode !== b.corpCode) return a.corpCode < b.corpCode ? -1 : 1;
  if (a.bsnsYear !== b.bsnsYear) return a.bsnsYear - b.bsnsYear;
  return a.reprtCode < b.reprtCode ? -1 : a.reprtCode > b.reprtCode ? 1 : 0;
}

/** 순서·중복과 무관하게 같은 출처 목록이 같은 모양이 되도록 정렬한다 */
export function normalizeSources(sources: readonly DataSource[]): DataSource[] {
  const byKey = new Map<string, DataSource>();
  for (const s of sources) {
    byKey.set(`${s.corpCode}|${s.bsnsYear}|${s.reprtCode}`, {
      corpCode: s.corpCode,
      bsnsYear: s.bsnsYear,
      reprtCode: s.reprtCode,
      fsDiv: s.fsDiv,
      rceptNo: s.rceptNo,
      ...(s.collected
        ? { collected: { fsDiv: s.collected.fsDiv, rceptNo: s.collected.rceptNo } }
        : {}),
    });
  }
  return [...byKey.values()].sort(compareSources);
}

/** 객체 키를 정렬해 JSON으로 — 같은 값이면 언제나 같은 문자열 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/** 데이터 버전 해시 (dataset_versions.hash) */
export function hashDataVersion(content: DataVersionContent): string {
  return sha256(
    canonicalJson({
      sources: normalizeSources(content.sources),
      calcVersion: content.calcVersion,
      priceDate: content.priceDate,
      decisions: content.decisions,
    }),
  );
}

/** 분석 요청(정규화 JSON) 해시 (analyses.request_hash) — "같은 요청" 판정용 */
export function hashAnalysisRequest(request: unknown): string {
  return sha256(canonicalJson(request));
}

/**
 * 데이터 버전 ID. 회원별로 같은 해시면 늘 같은 ID가 나오게 해시에서 만든다 —
 * 결과(`basis.dataVersionId`)를 먼저 만들고 저장은 나중에 해도 ID가 어긋나지 않는다.
 * 비로그인 예시처럼 회원이 없으면 저장하지 않는 ID(표시용)다.
 */
export function dataVersionIdFor(ownerId: string | null, hash: string): UUID {
  const hex = sha256(`${ownerId ?? "guest"}:${hash}`);
  // UUID 모양(8-4-4-4-12). 버전 자리는 8(사용자 정의), variant 자리는 RFC 4122(8~b)
  const variant = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** 계산에 쓸 보고서(값이 있는 출처만)를 `computeCalendarQuarterMetrics`의 pins로 */
export function pinsOf(sources: readonly DataSource[], corpCode: string): ReportPin[] {
  return sources
    .filter((s) => s.corpCode === corpCode && s.fsDiv !== null && s.rceptNo !== null)
    .map((s) => ({
      bsnsYear: s.bsnsYear,
      reprtCode: s.reprtCode,
      fsDiv: s.fsDiv!,
      rceptNo: s.rceptNo!,
    }));
}
