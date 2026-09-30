// Phase 2 도구 목록 (TECH §4.4) — 엔진은 이 표에 있는 도구만 부른다. **Phase 2 동안 잠금** (PHASE2_PLAN §2).
// 각 도구의 구현은 담당자 파일에 있다: data-tools.ts(예림), news-tools.ts(현준).
import "server-only";
import { buildResult, getDisclosures, getFinancials, getPeers } from "./data-tools";
import { searchNews, writeExplanation } from "./news-tools";
import type { Tool, ToolName } from "./types";

export const TOOLS: { [T in ToolName]: Tool<T> } = {
  get_peers: getPeers,
  get_financials: getFinancials,
  get_disclosures: getDisclosures,
  search_news: searchNews,
  build_result: buildResult,
  write_explanation: writeExplanation,
};
