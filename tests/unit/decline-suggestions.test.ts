import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { fetchDeclineMessage, findCompanyNameInQuestion } from "@/lib/ask/decline";

// 투자 권유 거절은 "같은 기업의 사실 분석 예시"를 추천한다 (PRD §6.3.1). DB 문구의 "○○"에 질문 속 기업 이름을 넣는다.
const COMPANIES = ["삼성전자", "SK하이닉스", "KB금융"];

function fakeDb(options: { failCompanies?: boolean } = {}) {
  const client = {
    from: (table: string) => {
      if (table === "decline_messages") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: {
                  category: "advice_request",
                  message: "죄송합니다. 투자 권유는 드릴 수 없어요.",
                  suggestions: ["○○ 최근 4개 분기 실적과 주요 공시 알려줘"],
                },
                error: null,
              }),
            }),
          }),
        };
      }
      // companies: .select().in("corp_name", names).limit(n)
      return {
        select: () => ({
          in: (_col: string, names: string[]) => ({
            limit: async () => {
              if (options.failCompanies) throw new Error("DB 장애");
              return {
                data: COMPANIES.filter((c) => names.includes(c)).map((corp_name) => ({
                  corp_name,
                })),
                error: null,
              };
            },
          }),
        }),
      };
    },
  };
  return client as unknown as SupabaseClient;
}

describe("거절 추천 질문의 기업 자리(○○)", () => {
  it("질문 속 기업 이름을 찾는다 — 조사가 붙어도 (삼성전자는, SK하이닉스를)", async () => {
    expect(await findCompanyNameInQuestion("삼성전자 지금 사도 돼?", fakeDb())).toBe("삼성전자");
    expect(await findCompanyNameInQuestion("지금 SK하이닉스를 사야 할까?", fakeDb())).toBe(
      "SK하이닉스",
    );
    expect(await findCompanyNameInQuestion("목표주가 얼마야?", fakeDb())).toBeNull();
  });

  it("투자 권유 거절: 같은 기업의 사실 분석 예시로 바꿔 보여 준다", async () => {
    const decline = await fetchDeclineMessage("advice_request", fakeDb(), "KB금융 지금 사도 돼?");
    expect(decline.suggestions).toEqual(["KB금융 최근 4개 분기 실적과 주요 공시 알려줘"]);
  });

  it("기업이 없거나 찾기가 실패해도 '○○' 글자를 그대로 내보내지 않는다", async () => {
    const none = await fetchDeclineMessage("advice_request", fakeDb(), "목표주가 얼마야?");
    expect(none.suggestions[0]).toBe("삼성전자 최근 4개 분기 실적과 주요 공시 알려줘");
    const failed = await fetchDeclineMessage(
      "advice_request",
      fakeDb({ failCompanies: true }),
      "KB금융 사도 돼?",
    );
    expect(failed.suggestions[0]).not.toContain("○○");
  });
});
