import { describe, expect, it } from "vitest";
import type { ResultObject } from "@/contracts";
import { toDecisions } from "@/lib/preprocess/decisions";
import { buildDiagnoses } from "@/lib/preprocess/diagnose";
import { hasUndecided, withDefaults } from "@/lib/preprocess/types";
import { sameNumbers } from "@/lib/versions/compare";
import {
  canonicalJson,
  dataVersionIdFor,
  hashAnalysisRequest,
  hashDataVersion,
  normalizeSources,
  pinsOf,
  type DataSource,
  type DataVersionContent,
} from "@/lib/versions/version";

const S1: DataSource = {
  corpCode: "00164779",
  bsnsYear: 2026,
  reprtCode: "11012",
  fsDiv: "CFS",
  rceptNo: "20260814000100",
};
const S2: DataSource = {
  corpCode: "00164779",
  bsnsYear: 2026,
  reprtCode: "11013",
  fsDiv: "CFS",
  rceptNo: "20260515000100",
};
const MISSING: DataSource = {
  corpCode: "00164779",
  bsnsYear: 2026,
  reprtCode: "11014",
  fsDiv: null,
  rceptNo: null,
};

function content(overrides: Partial<DataVersionContent> = {}): DataVersionContent {
  return {
    sources: [S1, S2, MISSING],
    calcVersion: "v3",
    priceDate: null,
    decisions: {},
    ...overrides,
  };
}

describe("데이터 버전 해시·ID (WU-202)", () => {
  it("출처 순서가 달라도 해시가 같다", () => {
    expect(hashDataVersion(content())).toBe(
      hashDataVersion(content({ sources: [MISSING, S2, S1] })),
    );
  });

  it("접수번호·계산식 버전·전처리 선택 중 하나라도 다르면 해시가 다르다", () => {
    const base = hashDataVersion(content());
    expect(
      hashDataVersion(content({ sources: [{ ...S1, rceptNo: "20260820000200" }, S2] })),
    ).not.toBe(base);
    expect(hashDataVersion(content({ calcVersion: "v4" }))).not.toBe(base);
    expect(hashDataVersion(content({ decisions: { missing_account: "show_blank" } }))).not.toBe(
      base,
    );
  });

  it("데이터 버전 ID는 UUID 모양이고, 같은 회원·해시면 늘 같고 회원이 다르면 다르다", () => {
    const hash = hashDataVersion(content());
    const id = dataVersionIdFor("user-a", hash);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(dataVersionIdFor("user-a", hash)).toBe(id);
    expect(dataVersionIdFor("user-b", hash)).not.toBe(id);
  });

  it("분석 요청 해시는 키 순서와 무관하다", () => {
    expect(hashAnalysisRequest({ a: 1, b: { c: 2, d: 3 } })).toBe(
      hashAnalysisRequest({ b: { d: 3, c: 2 }, a: 1 }),
    );
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 0 }] })).toBe('{"a":[2,{"c":0,"d":1}],"b":1}');
  });

  it("같은 보고서가 두 번 들어와도 하나로 정리하고, 계산 pins에는 값이 있는 출처만 들어간다", () => {
    expect(normalizeSources([S1, S2, { ...S1 }])).toEqual([S1, S2]);
    expect(pinsOf([S1, MISSING, { ...S2, corpCode: "00126380" }], "00164779")).toEqual([
      { bsnsYear: 2026, reprtCode: "11012", fsDiv: "CFS", rceptNo: "20260814000100" },
    ]);
  });
});

describe("sameNumbers (Q6 재현성 확인)", () => {
  const figure = (value: number | null, display: string) => ({
    id: "f1",
    label: "매출",
    value,
    unit: "KRW" as const,
    display,
    basis: { report: "2026 반기보고서", fsDiv: "CFS" as const },
  });
  const result = (f: ReturnType<typeof figure>, extra = {}) =>
    ({ figures: { f1: f, ...extra } }) as unknown as ResultObject;

  it("값·표시가 모두 같아야 true", () => {
    expect(sameNumbers(result(figure(1, "1원")), result(figure(1, "1원")))).toBe(true);
    expect(sameNumbers(result(figure(1, "1원")), result(figure(2, "2원")))).toBe(false);
    expect(
      sameNumbers(result(figure(1, "1원")), result(figure(1, "1원"), { f2: figure(1, "1원") })),
    ).toBe(false);
  });
});

describe("진단 카드 만들기 (WU-203, TECH §9)", () => {
  it("연결·별도 혼재는 확인 필요, 결산월·분기 경계는 자동 처리(표시만)", () => {
    const diagnoses = buildDiagnoses({
      totalRows: 4,
      mixed: { affectedRows: 3, description: "섞임" },
      fiscalMonth: { description: "3월 결산" },
      boundaryMismatch: { description: "5월 결산" },
    });
    expect(diagnoses.map((d) => [d.kind, d.needsConfirmation, d.affectedRows])).toEqual([
      ["mixed_fs_div", true, 3],
      ["fiscal_month", false, 4],
      ["boundary_mismatch", false, 4],
    ]);
    expect(diagnoses[0].options.map((o) => [o.id, o.isDefault])).toEqual([
      ["unify_ofs", true],
      ["keep_mixed", false],
    ]);
  });

  it("영향 행이 0이면 진단을 만들지 않는다", () => {
    expect(
      buildDiagnoses({
        totalRows: 4,
        missing: { affectedRows: 0, description: "", sum: 0, sumExcluded: 0 },
      }),
    ).toEqual([]);
  });

  it("고르지 않은 진단은 기본값으로 채우고, 확인이 필요한 것만 '아직 안 고름'으로 본다", () => {
    const diagnoses = buildDiagnoses({
      totalRows: 4,
      missing: { affectedRows: 1, description: "", sum: 10, sumExcluded: 7 },
      fiscalMonth: { description: "3월 결산" },
    });
    expect(hasUndecided(diagnoses, {})).toBe(true);
    expect(hasUndecided(diagnoses, { missing_account: "show_blank" })).toBe(false);
    expect(withDefaults(diagnoses, { missing_account: "show_blank" })).toEqual({
      missing_account: "show_blank",
      fiscal_month: "calendar_convert",
    });
    // 잘못된 선택지는 기본값으로
    expect(withDefaults(diagnoses, { missing_account: "nope" }).missing_account).toBe(
      "exclude_quarter",
    );
  });

  it("Q5 선택: 자동 처리 진단은 안 골라도 되고, 확인이 필요한 진단은 빠지면 오류", () => {
    const diagnoses = buildDiagnoses({
      totalRows: 4,
      missing: { affectedRows: 1, description: "", sum: 10, sumExcluded: 7 },
      fiscalMonth: { description: "3월 결산" },
    });
    expect(
      toDecisions(diagnoses, [{ diagnosisId: "missing_account", optionId: "exclude_quarter" }]),
    ).toEqual({ missing_account: "exclude_quarter" });
    expect(() => toDecisions(diagnoses, [])).toThrow("확인이 필요한 진단");
  });
});
