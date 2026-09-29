import type { AccountMapRow } from "@/lib/financials/account-map";

/** supabase/seed.sql의 account_map 시드와 같은 내용(WU-105 테스트에서 재사용). */
export const ACCOUNT_MAP_SEED_ROWS: AccountMapRow[] = [
  {
    metric: "revenue",
    priority: 1,
    account_id: "ifrs-full_Revenue",
    account_nm: "매출액",
    industry_type: null,
  },
  {
    metric: "revenue",
    priority: 2,
    account_id: "ifrs-full_Revenue",
    account_nm: "영업수익",
    industry_type: "financial",
  },
  {
    metric: "operating_income",
    priority: 1,
    account_id: "dart_OperatingIncomeLoss",
    account_nm: "영업이익",
    industry_type: null,
  },
  {
    metric: "operating_income",
    priority: 2,
    account_id: "ifrs-full_ProfitLossFromOperatingActivities",
    account_nm: "영업이익",
    industry_type: "financial",
  },
  {
    metric: "net_income",
    priority: 1,
    account_id: "ifrs-full_ProfitLoss",
    account_nm: "당기순이익",
    industry_type: null,
  },
  {
    metric: "owners_net_income",
    priority: 1,
    account_id: "ifrs-full_ProfitLossAttributableToOwnersOfParent",
    account_nm: "지배기업소유주지분순이익",
    industry_type: null,
  },
  {
    metric: "equity",
    priority: 1,
    account_id: "ifrs-full_Equity",
    account_nm: "자본총계",
    industry_type: null,
  },
  {
    metric: "owners_equity",
    priority: 1,
    account_id: "ifrs-full_EquityAttributableToOwnersOfParent",
    account_nm: "지배기업소유주지분",
    industry_type: null,
  },
  {
    metric: "liabilities",
    priority: 1,
    account_id: "ifrs-full_Liabilities",
    account_nm: "부채총계",
    industry_type: null,
  },
  {
    metric: "assets",
    priority: 1,
    account_id: "ifrs-full_Assets",
    account_nm: "자산총계",
    industry_type: null,
  },
];
