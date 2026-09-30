// TECH §4.11.2 거절 처리. 문구는 서버가 `decline_messages`에서 그대로 내보낸다 — AI가 만들지 않는다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Decline, DeclineCategory } from "@/contracts";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { todayKst } from "@/lib/quota/kst";

/** manipulation은 API 응답에서 out_of_scope로만 보인다 (탐지 사실을 드러내지 않음, §4.11.2). */
export type InternalDeclineCategory = DeclineCategory | "manipulation";

function toPublicCategory(category: InternalDeclineCategory): DeclineCategory {
  return category === "manipulation" ? "out_of_scope" : category;
}

interface DeclineMessageRow {
  category: string;
  message: string;
  suggestions: string[];
}

/** 추천 질문의 기업 자리. 투자 권유 거절은 "같은 기업의 사실 분석 예시"를 보여 준다 (PRD §6.3.1) */
const COMPANY_SLOT = "○○";
const FALLBACK_COMPANY = "삼성전자";
// "삼성전자는", "SK하이닉스를"처럼 이름 뒤에 붙는 조사·말
const TRAILING_PARTICLE_RE = /(은|는|이|가|을|를|의|도|랑|이랑|하고|에서|주식|주가|주)$/;

/**
 * 질문에 들어 있는 상장사 이름을 찾는다 (정확히 같은 이름만, 외부 호출 없음). 못 찾으면 null.
 * 거절된 질문은 AI가 기업을 뽑지 않으므로 질문 글자에서 직접 찾는다.
 */
export async function findCompanyNameInQuestion(
  question: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<string | null> {
  const words = question
    .split(/[\s,.?!·~"'()]+/)
    .filter(Boolean)
    .slice(0, 12);
  const candidates = [
    ...new Set(words.flatMap((w) => [w, w.replace(TRAILING_PARTICLE_RE, "")])),
  ].filter((w) => w.length >= 2);
  if (candidates.length === 0) return null;
  const { data, error } = await client
    .from("companies")
    .select("corp_name")
    .in("corp_name", candidates)
    .limit(5);
  if (error) return null; // 예시 문구용이라 실패해도 기본 기업으로 둔다
  const names = new Set((data as { corp_name: string }[] | null)?.map((r) => r.corp_name) ?? []);
  return candidates.find((c) => names.has(c)) ?? null;
}

export async function fetchDeclineMessage(
  category: InternalDeclineCategory,
  client: SupabaseClient = getSupabaseAdmin(),
  /** 주면 추천 질문의 "○○"를 질문 속 기업 이름(없으면 삼성전자)으로 바꾼다 */
  question?: string,
): Promise<Decline> {
  const { data, error } = await client
    .from("decline_messages")
    .select("category, message, suggestions")
    .eq("category", category)
    .maybeSingle();

  if (error) throw new Error(`거절 문구 조회 실패: ${error.message}`);
  if (!data) throw new Error(`거절 문구가 없습니다: ${category}`);

  const row = data as DeclineMessageRow;
  let suggestions = row.suggestions ?? [];
  if (suggestions.some((s) => s.includes(COMPANY_SLOT))) {
    // 예시 문구용이라 이름 찾기가 실패해도 거절 안내 자체는 그대로 보여 준다
    const found = question
      ? await findCompanyNameInQuestion(question, client).catch(() => null)
      : null;
    const company = found ?? FALLBACK_COMPANY;
    suggestions = suggestions.map((s) => s.replaceAll(COMPANY_SLOT, company));
  }
  return {
    category: toPublicCategory(category),
    message: row.message,
    suggestions,
    questionCharged: true,
  };
}

/** 회원이 오늘 이미 `max_declines_per_day`에 도달했는지 (판정 자체를 생략하고 429 DECLINE_LIMIT). */
export async function hasReachedDeclineLimit(
  userId: string,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<boolean> {
  const [{ data: usage, error: usageError }, { data: config, error: configError }] =
    await Promise.all([
      client
        .from("usage_daily")
        .select("declines")
        .eq("user_id", userId)
        .eq("day_kst", todayKst())
        .maybeSingle(),
      client.from("quota_config").select("value").eq("key", "max_declines_per_day").maybeSingle(),
    ]);

  if (usageError) throw new Error(`거절 횟수 조회 실패: ${usageError.message}`);
  if (configError) throw new Error(`거절 한도 조회 실패: ${configError.message}`);

  const declines = (usage as { declines: number } | null)?.declines ?? 0;
  const limit = Number((config as { value: number } | null)?.value ?? Infinity);
  return declines >= limit;
}

/** 거절 1건 기록: 회원별 하루 거절 수 + 전체 유형별 건수 (DB 함수 `record_decline`, 원자적). */
export async function recordDecline(
  userId: string,
  category: InternalDeclineCategory,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<void> {
  const { error } = await client.rpc("record_decline", {
    p_user_id: userId,
    p_category: category,
  });
  if (error) throw new Error(`거절 기록 실패: ${error.message}`);
}
