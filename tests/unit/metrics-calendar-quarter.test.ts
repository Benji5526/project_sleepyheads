import { describe, expect, it } from "vitest";
import {
  calendarAnnualFlow,
  calendarAnnualStock,
  mapFiscalQuarterToCalendar,
} from "@/lib/metrics/calendar-quarter";

describe("mapFiscalQuarterToCalendar (WU-106, TECH §6.3)", () => {
  it("12월 결산은 회계 분기 = 달력 분기다(경계 불일치 없음)", () => {
    expect(mapFiscalQuarterToCalendar(2025, 1, 12)).toEqual({
      calYear: 2025,
      calQuarter: 1,
      boundaryMismatch: false,
    });
    expect(mapFiscalQuarterToCalendar(2025, 4, 12)).toEqual({
      calYear: 2025,
      calQuarter: 4,
      boundaryMismatch: false,
    });
  });

  it("3월 결산 가상 데이터: 회계 1분기 → 같은 해 달력 2Q, 회계 4분기 → 다음 해 달력 1Q (완료조건, TECH §6.3 표)", () => {
    // TECH §6.3 예시 표 그대로: 회계 1분기(4~6월, 종료월 6월) → 2Q.
    expect(mapFiscalQuarterToCalendar(2025, 1, 3)).toEqual({
      calYear: 2025,
      calQuarter: 2,
      boundaryMismatch: false,
    });
    // 반기(3개월분, 7~9월, 종료월 9월) → 3Q.
    expect(mapFiscalQuarterToCalendar(2025, 2, 3)).toEqual({
      calYear: 2025,
      calQuarter: 3,
      boundaryMismatch: false,
    });
    // 회계 3분기(3개월분, 10~12월, 종료월 12월) → 4Q(같은 해).
    expect(mapFiscalQuarterToCalendar(2025, 3, 3)).toEqual({
      calYear: 2025,
      calQuarter: 4,
      boundaryMismatch: false,
    });
    // 사업보고서−3분기누적(다음 해 1~3월, 종료월 3월) → 다음 해 1Q.
    expect(mapFiscalQuarterToCalendar(2025, 4, 3)).toEqual({
      calYear: 2026,
      calQuarter: 1,
      boundaryMismatch: false,
    });
  });

  it("12월 외 결산 샘플 2곳(6월·9월 결산)의 달력 분기가 손 계산과 일치한다(완료조건)", () => {
    // 6월 결산(accMt=6): 회계연도 시작월 = 7월. 회계 1분기 = 7~9월(종료월 9월) → 3Q.
    expect(mapFiscalQuarterToCalendar(2025, 1, 6)).toEqual({
      calYear: 2025,
      calQuarter: 3,
      boundaryMismatch: false,
    });
    // 회계 2분기 = 10~12월(종료월 12월) → 4Q(같은 해).
    expect(mapFiscalQuarterToCalendar(2025, 2, 6)).toEqual({
      calYear: 2025,
      calQuarter: 4,
      boundaryMismatch: false,
    });
    // 회계 3분기 = 다음 해 1~3월(종료월 3월) → 다음 해 1Q.
    expect(mapFiscalQuarterToCalendar(2025, 3, 6)).toEqual({
      calYear: 2026,
      calQuarter: 1,
      boundaryMismatch: false,
    });
    // 회계 4분기(연간−3분기누적) = 다음 해 4~6월(종료월 6월) → 다음 해 2Q.
    expect(mapFiscalQuarterToCalendar(2025, 4, 6)).toEqual({
      calYear: 2026,
      calQuarter: 2,
      boundaryMismatch: false,
    });

    // 9월 결산(accMt=9): 회계연도 시작월 = 10월. 회계 1분기 = 10~12월(종료월 12월) → 4Q(같은 해).
    expect(mapFiscalQuarterToCalendar(2025, 1, 9)).toEqual({
      calYear: 2025,
      calQuarter: 4,
      boundaryMismatch: false,
    });
    // 회계 4분기 = 다음 해 7~9월(종료월 9월) → 다음 해 3Q.
    expect(mapFiscalQuarterToCalendar(2025, 4, 9)).toEqual({
      calYear: 2026,
      calQuarter: 3,
      boundaryMismatch: false,
    });
  });

  it("결산월이 3·6·9·12월이 아니면 분기 경계 불일치로 표시한다", () => {
    expect(mapFiscalQuarterToCalendar(2025, 1, 5).boundaryMismatch).toBe(true);
    expect(mapFiscalQuarterToCalendar(2025, 1, 12).boundaryMismatch).toBe(false);
  });
});

describe("calendarAnnualFlow / calendarAnnualStock (TECH §6.3)", () => {
  it("네 분기가 모두 있으면 합산한다", () => {
    expect(calendarAnnualFlow([BigInt(10), BigInt(20), BigInt(30), BigInt(40)])).toBe(BigInt(100));
  });

  it("네 분기 중 하나라도 없으면 달력 연간 값이 비어 있다 (완료조건)", () => {
    expect(calendarAnnualFlow([BigInt(10), null, BigInt(30), BigInt(40)])).toBeNull();
  });

  it("재무상태표 항목은 달력 4Q말 값 그대로다(합산하지 않음)", () => {
    expect(calendarAnnualStock(BigInt(500))).toBe(BigInt(500));
    expect(calendarAnnualStock(null)).toBeNull();
  });
});
