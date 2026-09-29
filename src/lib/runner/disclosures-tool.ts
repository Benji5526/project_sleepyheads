// `get_disclosures` 도구 (TECH §4.4, intent="event"). 최신성 규칙(§5.1, 24시간)은 ensureDisclosures가 지킨다.
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyRef, Disclosure, PeriodRange } from "@/contracts";
import { getDisclosures } from "@/lib/disclosures/get-disclosures";
import { ensureDisclosures } from "@/lib/disclosures/sync";
import { quarterDateRange } from "@/lib/ask/quarter";

export interface FetchEventDisclosuresOptions {
  userId?: string | null;
  analysisId?: string | null;
  client?: SupabaseClient;
}

export async function fetchEventDisclosures(
  company: CompanyRef,
  period: PeriodRange,
  options: FetchEventDisclosuresOptions = {},
): Promise<Disclosure[]> {
  await ensureDisclosures(company.corpCode, {
    userId: options.userId ?? null,
    analysisId: options.analysisId ?? null,
    client: options.client,
  });

  const from = quarterDateRange(period.from).from;
  const to = quarterDateRange(period.to).to;
  return getDisclosures(company.corpCode, { from, to }, undefined, { client: options.client });
}
