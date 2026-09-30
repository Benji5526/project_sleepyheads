import { describe, expect, it } from "vitest";
import type { MetricId } from "@/contracts";
import { METRIC_LABEL } from "@/lib/runner/metric-info";
import { GLOSSARY, METRIC_GLOSSARY, lookupTerm, splitTerms } from "@/components/glossary/terms";

// WU-402 완료조건: 재무 용어 한 줄 설명 (PRD F-Z5)

describe("용어 사전이 계산 엔진의 지표를 모두 덮는다", () => {
  for (const [metric, label] of Object.entries(METRIC_LABEL) as [MetricId, string][]) {
    it(`${metric} (${label})`, () => {
      const entry = METRIC_GLOSSARY[metric];
      expect(entry, `${metric} 설명이 없습니다`).toBeDefined();
      // 화면에 나오는 지표 이름 그대로 찾으면 이 항목이 나온다
      expect(lookupTerm(label)).toBe(entry);
      expect(splitTerms(label)).toEqual([{ text: label, entry }]);
    });
  }

  it("지시문에 적힌 용어(영업이익률·ROE·PER·PBR·TTM·부채비율·자기자본비율)가 있다", () => {
    for (const term of ["영업이익률", "ROE", "PER", "PBR", "TTM", "부채비율", "자기자본비율"]) {
      expect(lookupTerm(term), term).not.toBeNull();
    }
  });
});

describe("설명 문장", () => {
  for (const entry of GLOSSARY) {
    it(`${entry.term}: 한 문장, 비어 있지 않고 너무 길지 않다`, () => {
      expect(entry.description.trim().length).toBeGreaterThan(10);
      expect(entry.description.length).toBeLessThanOrEqual(80);
      // 한 줄 설명 — 문장이 하나(끝의 마침표 한 번)
      expect(entry.description.match(/[.?!。]/g) ?? []).toHaveLength(1);
      expect(entry.description.endsWith(".")).toBe(true);
    });
  }

  it("같은 글자가 두 용어에 겹쳐 쓰이지 않는다", () => {
    const all = GLOSSARY.flatMap((e) => [e.term, ...e.aliases]);
    expect(new Set(all).size).toBe(all.length);
  });
});

describe("splitTerms — 화면 글자에서 용어 찾기", () => {
  it("긴 용어를 먼저 찾는다 (영업이익률을 영업이익으로 자르지 않음)", () => {
    const parts = splitTerms("SK하이닉스 분기별 영업이익률 (2025Q3~2026Q2)");
    expect(parts.filter((p) => p.entry).map((p) => p.text)).toEqual(["영업이익률"]);
    expect(parts.map((p) => p.text).join("")).toBe("SK하이닉스 분기별 영업이익률 (2025Q3~2026Q2)");
  });

  it("한 글자 안의 여러 용어를 각각 찾는다", () => {
    const parts = splitTerms("매출액 전년 동기 대비");
    expect(parts.filter((p) => p.entry).map((p) => [p.text, p.entry!.term])).toEqual([
      ["매출액", "매출"],
      ["전년 동기 대비", "YoY 증감률"],
    ]);
  });

  it("같은 용어는 처음 한 번만 표시한다", () => {
    const parts = splitTerms("매출액·영업이익 — 매출액 기준");
    expect(parts.filter((p) => p.entry).map((p) => p.text)).toEqual(["매출액", "영업이익"]);
  });

  it("용어가 없으면 글자 그대로 한 조각", () => {
    expect(splitTerms("2026년 2분기 실적")).toEqual([{ text: "2026년 2분기 실적", entry: null }]);
  });

  it("금융사 지표 이름(영업이익률(영업이익÷영업수익))도 나눈다", () => {
    const terms = splitTerms("영업이익률(영업이익÷영업수익)")
      .filter((p) => p.entry)
      .map((p) => p.entry!.term);
    expect(terms).toEqual(["영업이익률", "영업이익", "매출"]);
  });
});
