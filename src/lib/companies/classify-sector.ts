import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const FALLBACK_SECTOR_NAME = "기타";

export interface SectorClassification {
  sectorId: string;
  sectorSource: "manual" | "induty_code" | "other";
}

interface SectorOverrideRow {
  sector_id: string;
}

interface SectorRuleRow {
  induty_prefix: string;
  sector_id: string;
}

/**
 * 섹터 분류 (WU-104, TECH §8). 순서: ① `sector_overrides`(수동 지정) ② `sector_rules`
 * (업종코드 앞자리, 가장 긴 접두어 우선) ③ `기타`.
 */
export async function classifySector(
  admin: SupabaseClient,
  corpCode: string,
  indutyCode: string | null,
): Promise<SectorClassification> {
  const override = await findOverride(admin, corpCode);
  if (override) return { sectorId: override.sector_id, sectorSource: "manual" };

  if (indutyCode) {
    const rule = await findMatchingRule(admin, indutyCode);
    if (rule) return { sectorId: rule.sector_id, sectorSource: "induty_code" };
  }

  const fallbackId = await getFallbackSectorId(admin);
  return { sectorId: fallbackId, sectorSource: "other" };
}

async function findOverride(
  admin: SupabaseClient,
  corpCode: string,
): Promise<SectorOverrideRow | null> {
  const { data, error } = await admin
    .from("sector_overrides")
    .select("sector_id")
    .eq("corp_code", corpCode)
    .maybeSingle();
  if (error) throw new Error(`섹터 수동 지정 조회 실패: ${error.message}`);
  return (data as unknown as SectorOverrideRow | null) ?? null;
}

async function findMatchingRule(
  admin: SupabaseClient,
  indutyCode: string,
): Promise<SectorRuleRow | null> {
  // 표 자체가 작아(TECH §8 예시 6개 안팎) 전부 받아 앱에서 가장 긴 접두어를 고른다.
  const { data, error } = await admin.from("sector_rules").select("induty_prefix, sector_id");
  if (error) throw new Error(`섹터 규칙 조회 실패: ${error.message}`);

  const rules = (data ?? []) as unknown as SectorRuleRow[];
  const matches = rules.filter((rule) => indutyCode.startsWith(rule.induty_prefix));
  if (matches.length === 0) return null;

  return matches.reduce((longest, rule) =>
    rule.induty_prefix.length > longest.induty_prefix.length ? rule : longest,
  );
}

async function getFallbackSectorId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin
    .from("sectors")
    .select("id")
    .eq("name", FALLBACK_SECTOR_NAME)
    .maybeSingle();
  if (error) throw new Error(`"${FALLBACK_SECTOR_NAME}" 섹터 조회 실패: ${error.message}`);
  if (!data) throw new Error(`"${FALLBACK_SECTOR_NAME}" 섹터가 시드에 없습니다.`);
  return (data as unknown as { id: string }).id;
}
