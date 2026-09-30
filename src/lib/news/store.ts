// WU-304 뉴스 단서 저장 (`news_clues`, TECH §15.2). search_news 도구가 부른다.
// 제목·언론사·발행일·링크·요지만 넣는다 — 본문은 표에 칸이 없다.
// 같은 분석의 search_news가 다시 돌면(재시도·이어서 실행) 앞 기록을 지우고 이번 것으로 바꾼다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NewsClue } from "@/contracts";

export interface SaveNewsCluesInput {
  ownerId: string;
  analysisId: string;
  clues: NewsClue[];
}

/** 저장하면 true. **던지지 않는다** — 저장이 실패해도 이번 분석 글에는 단서가 그대로 붙는다 */
export async function saveNewsClues(
  client: SupabaseClient,
  input: SaveNewsCluesInput,
): Promise<boolean> {
  try {
    const removed = await client
      .from("news_clues")
      .delete()
      .eq("analysis_id", input.analysisId)
      .eq("owner_id", input.ownerId);
    if (removed.error) return false;
    if (input.clues.length === 0) return true;

    const { error } = await client.from("news_clues").insert(
      input.clues.map((clue) => ({
        owner_id: input.ownerId,
        analysis_id: input.analysisId,
        news_id: clue.newsId,
        title: clue.title,
        press: clue.press,
        pub_date: clue.publishedAt,
        url: clue.url,
        gist: clue.gist,
      })),
    );
    return !error;
  } catch {
    return false;
  }
}
