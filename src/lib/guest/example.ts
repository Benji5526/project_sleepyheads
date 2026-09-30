// WU-115 비로그인 예시: SK하이닉스 예시 분석을 미리 만들어 `guest_examples`에 저장하고(C2),
// 비로그인 첫 화면에는 저장된 것만 내려준다(G1 — 외부 API·AI 호출 없음, TECH §14).
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { GuestExample } from "@/contracts";
import { interpretQuestion } from "@/lib/ask/interpret";
import { dartFetch, type DartEnvelope } from "@/lib/dart/client";
import { generateExplanation } from "@/lib/explain/generate";
import { executeAnalysis } from "@/lib/runner/execute";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/** 예시 질문 (API_SPEC G1, PRD F-G1) */
export const GUEST_EXAMPLE_QUESTION = "SK하이닉스 최근 실적 어때?";

interface GuestExampleRow {
  question: string;
  result: GuestExample["result"];
  explanation: GuestExample["explanation"];
  generated_at: string;
}

/** 가장 최근에 만든 예시. 아직 없으면 null */
export async function loadGuestExample(
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<GuestExample | null> {
  const { data, error } = await client
    .from("guest_examples")
    .select("question, result, explanation, generated_at")
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`guest_examples 조회 실패: ${error.message}`);
  const row = data as GuestExampleRow | null;
  if (!row) return null;
  return {
    question: row.question,
    result: row.result,
    explanation: row.explanation,
    generatedAt: row.generated_at,
  };
}

/** 예시로 쓸 수 없는 결과 (되묻기·거절·설명 실패 등). 기존 예시는 그대로 둔다 */
export class GuestExampleUnusableError extends Error {
  constructor(reason: string) {
    super(`비로그인 예시를 만들지 못했습니다: ${reason}`);
    this.name = "GuestExampleUnusableError";
  }
}

/**
 * 회원 질문과 같은 순서(해석 → 실행 → 설명 작성)로 예시를 새로 만든다. 저장은 하지 않는다.
 * AI 호출 2번 + (처음이면) 전자공시 보고서 수집이 일어난다.
 */
export async function buildGuestExample(
  client: SupabaseClient = getSupabaseAdmin(),
  now: () => Date = () => new Date(),
): Promise<GuestExample> {
  const question = GUEST_EXAMPLE_QUESTION;
  const interpreted = await interpretQuestion({ question, userId: null, client });
  if (interpreted.type !== "resolved") {
    throw new GuestExampleUnusableError(`질문 해석 결과가 ${interpreted.type}`);
  }

  const result = await executeAnalysis(interpreted.request, { client });
  const explanation = await generateExplanation({
    question,
    result,
    mixedScope: interpreted.hasOutOfScopePart,
  });
  // 설명이 실패한 예시를 첫 화면에 걸면 서비스가 고장 난 것처럼 보인다
  if (explanation.status !== "ready") {
    throw new GuestExampleUnusableError("분석 글 작성 실패");
  }

  return { question, result, explanation, generatedAt: now().toISOString() };
}

interface DartListResponse extends DartEnvelope {
  list?: Array<{ rcept_dt: string; report_nm: string }>;
}

/** since(예시를 만든 시각) 이후 이 기업의 정기공시(분기·반기·사업보고서)가 새로 나왔는가 */
export async function hasNewRegularReport(
  corpCode: string,
  since: Date,
  now: Date,
  client: SupabaseClient = getSupabaseAdmin(),
): Promise<boolean> {
  const res = await dartFetch<DartListResponse>(
    "list.json",
    {
      corp_code: corpCode,
      bgn_de: kstDartDate(since),
      end_de: kstDartDate(now),
      pblntf_ty: "A", // 정기공시
      page_count: 10,
    },
    { client },
  );
  if (res.status === "013") return false; // 조회된 공시 없음
  // 목록 조회는 날짜 단위라, 만든 날 접수된 보고서도 새 것으로 본다. 예약 실행(04시)이 만든 예시라면
  // 그날 접수분은 항상 그 뒤에 나온 것이고, 수동 생성 뒤 같은 날 나온 보고서도 놓치지 않는다.
  // 그 결과 한 번 더 만들어도 generatedAt이 다음 날로 넘어가 반복되지 않는다
  return (res.list ?? []).length > 0;
}

export type RefreshReason = "forced" | "no_example" | "new_report" | "no_new_report";

export interface RefreshGuestExampleResult {
  regenerated: boolean;
  reason: RefreshReason;
}

/**
 * C2 예약 실행 본체 (API_SPEC C2): 예시가 없거나 SK하이닉스 정기보고서가 새로 나왔을 때만 다시 만든다.
 * force = 관리자가 손으로 다시 만들 때.
 */
export async function refreshGuestExample(
  options: { force?: boolean; client?: SupabaseClient; now?: () => Date } = {},
): Promise<RefreshGuestExampleResult> {
  const client = options.client ?? getSupabaseAdmin();
  const now = options.now ?? (() => new Date());

  const current = await loadGuestExample(client);
  let reason: RefreshReason;
  if (options.force) reason = "forced";
  else if (!current) reason = "no_example";
  else {
    const corpCode = current.result.basis.target.corpCode;
    const isNew = await hasNewRegularReport(corpCode, new Date(current.generatedAt), now(), client);
    if (!isNew) return { regenerated: false, reason: "no_new_report" };
    reason = "new_report";
  }

  const example = await buildGuestExample(client, now);
  const { error } = await client.from("guest_examples").insert({
    question: example.question,
    result: example.result,
    explanation: example.explanation,
    generated_at: example.generatedAt,
  });
  if (error) throw new Error(`guest_examples 저장 실패: ${error.message}`);
  return { regenerated: true, reason };
}

/** 한국 날짜 "YYYYMMDD" (OpenDART 날짜 인자) */
function kstDartDate(date: Date): string {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
    .replaceAll("-", "");
}
