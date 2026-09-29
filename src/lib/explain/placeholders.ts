// TECH §11.4 숫자 자리표시자 방식. AI는 {{f3}}처럼 ID로만 숫자를 가리키고, 서버가 실제 값(단위
// 포함)으로 바꿔 넣는다. ID가 아닌 숫자(연도·분기 표기 제외)가 남아 있거나 없는 ID를 가리키면
// 그 문장 전체를 버린다 — 절반만 채워진 문장을 내보내지 않는다.
import type { Figure } from "@/contracts";

const PLACEHOLDER_RE = /\{\{(f\d+)\}\}/g;

/** 자리표시자를 뺀 나머지에서 "연도·분기 표기"로 봐줄 접미사 (개수 표현 "4개 분기" 포함). */
const ALLOWED_NUMBER_CONTEXT_RE = /^(년|개월|월|분기|개|Q[1-4])/;

function stripPlaceholders(text: string): string {
  return text.replace(PLACEHOLDER_RE, "");
}

/** 자리표시자를 뺀 나머지 텍스트에 "연도·분기 표기가 아닌" 숫자가 남아 있는가. */
export function hasDisallowedRawNumber(rawText: string): boolean {
  const stripped = stripPlaceholders(rawText);
  const digitRun = /\d+/g;
  let match: RegExpExecArray | null;
  while ((match = digitRun.exec(stripped)) !== null) {
    const after = stripped.slice(match.index + match[0].length);
    if (!ALLOWED_NUMBER_CONTEXT_RE.test(after)) return true;
  }
  return false;
}

export interface FillResult {
  text: string;
  /** false면 목록에 없는 ID를 가리켰다는 뜻 — 이 문장은 버려야 한다. */
  ok: boolean;
}

/** {{f3}} → figures.f3.display. 목록에 없는 ID를 만나면 즉시 실패로 표시한다. */
export function fillPlaceholders(rawText: string, figures: Record<string, Figure>): FillResult {
  let ok = true;
  const text = rawText.replace(PLACEHOLDER_RE, (_match, id: string) => {
    const figure = figures[id];
    if (!figure) {
      ok = false;
      return "";
    }
    return figure.display;
  });
  return { text, ok };
}

/**
 * 자리표시자를 채우고, 아래 중 하나라도 걸리면 폐기한다(문장 전체를 버림 — 완료조건):
 * - 없는 ID를 가리킴
 * - ID가 아닌 숫자(연도·분기 표기 제외)가 남아 있음
 * 통과하면 서버가 실제 값으로 채운 최종 문장을 돌려준다.
 */
export function resolveText(rawText: string, figures: Record<string, Figure>): string | null {
  if (hasDisallowedRawNumber(rawText)) return null;
  const { text, ok } = fillPlaceholders(rawText, figures);
  return ok ? text : null;
}
