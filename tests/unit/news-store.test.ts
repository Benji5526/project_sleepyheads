// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { NewsClue } from "@/contracts";
import { saveNewsClues } from "@/lib/news/store";

// WU-304 news_clues 저장 도우미 — 가짜 Supabase 클라이언트로 무엇을 지우고 넣는지 본다.
// 표 자체(RLS·연쇄 삭제·본문 칸 없음)는 tests/unit/db/news-clues.test.ts.

const CLUE: NewsClue = {
  newsId: "n1",
  title: "SK하이닉스 2분기 실적",
  press: "연합뉴스",
  publishedAt: "2026-07-24T01:00:00.000Z",
  url: "https://news.google.com/rss/articles/abc?oc=5",
  gist: "연합뉴스는 2분기 실적 발표를 보도했다.",
};

type Call = { op: string; table: string; filters?: [string, unknown][]; rows?: unknown };

function fakeClient(
  options: { deleteError?: boolean; insertError?: boolean; throws?: boolean } = {},
) {
  const calls: Call[] = [];
  const client = {
    from(table: string) {
      if (options.throws) throw new Error("연결 끊김");
      return {
        delete() {
          const call: Call = { op: "delete", table, filters: [] };
          calls.push(call);
          const chain = {
            eq(column: string, value: unknown) {
              call.filters!.push([column, value]);
              return chain;
            },
            then(resolve: (v: unknown) => void) {
              resolve({ error: options.deleteError ? { message: "x" } : null });
            },
          };
          return chain;
        },
        insert(rows: unknown) {
          calls.push({ op: "insert", table, rows });
          return Promise.resolve({ error: options.insertError ? { message: "x" } : null });
        },
      };
    },
  };
  return { client: client as never, calls };
}

describe("saveNewsClues (WU-304)", () => {
  it("그 분석의 앞 기록을 지우고(재시도·이어서 실행 대비) 제목·언론사·발행일·링크·요지만 넣는다", async () => {
    const { client, calls } = fakeClient();

    const ok = await saveNewsClues(client, { ownerId: "u1", analysisId: "a1", clues: [CLUE] });

    expect(ok).toBe(true);
    expect(calls[0]).toEqual({
      op: "delete",
      table: "news_clues",
      filters: [
        ["analysis_id", "a1"],
        ["owner_id", "u1"],
      ],
    });
    expect(calls[1]).toEqual({
      op: "insert",
      table: "news_clues",
      rows: [
        {
          owner_id: "u1",
          analysis_id: "a1",
          news_id: "n1",
          title: CLUE.title,
          press: CLUE.press,
          pub_date: CLUE.publishedAt,
          url: CLUE.url,
          gist: CLUE.gist,
        },
      ],
    });
  });

  it("단서가 0건이면 지우기만 한다", async () => {
    const { client, calls } = fakeClient();
    expect(await saveNewsClues(client, { ownerId: "u1", analysisId: "a1", clues: [] })).toBe(true);
    expect(calls.map((c) => c.op)).toEqual(["delete"]);
  });

  it("DB 오류·예외에도 던지지 않고 false", async () => {
    for (const options of [{ deleteError: true }, { insertError: true }, { throws: true }]) {
      const { client } = fakeClient(options);
      await expect(
        saveNewsClues(client, { ownerId: "u1", analysisId: "a1", clues: [CLUE] }),
      ).resolves.toBe(false);
    }
  });
});
