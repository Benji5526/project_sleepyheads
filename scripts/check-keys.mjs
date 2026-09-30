// 외부 서비스 키 점검 (WU-002 시험 호출). 사용법: pnpm check:keys
// .env.local의 키로 각 서비스를 한 번씩 불러 결과만 보여준다. 키 값은 절대 출력하지 않는다.
import { readFileSync } from "node:fs";

const envPath = process.argv[2] ?? ".env.local";
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim() && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
);

const results = [];
const report = (name, ok, detail) => results.push({ name, ok, detail });
const empty = (key) => !env[key];
/** 응답에 키가 섞여 나오지 않게 가린다 */
const hide = (text) =>
  Object.values(env).reduce((t, v) => (v.length >= 8 ? t.split(v).join("<KEY>") : t), text);

// OpenDART — SK하이닉스 기업개황 (완료조건: status 000)
async function opendart() {
  if (empty("OPENDART_API_KEY")) return report("OpenDART", null, "키 없음 (건너뜀)");
  const url = `https://opendart.fss.or.kr/api/company.json?crtfc_key=${encodeURIComponent(env.OPENDART_API_KEY)}&corp_code=00164779`;
  const body = await (await fetch(url)).json().catch(() => ({}));
  const meaning = {
    "000": "정상",
    "010": "등록되지 않은 키",
    "011": "사용할 수 없는 키",
    "013": "조회된 데이터 없음 (키는 정상)",
    "020": "요청 제한 초과",
  };
  report(
    "OpenDART",
    body.status === "000",
    `status ${body.status} ${meaning[body.status] ?? hide(body.message ?? "")} ${body.corp_name ? `→ ${body.corp_name}` : ""}`,
  );
}

// OpenAI — 짧은 문장 1회 (비용 거의 없음)
async function openai() {
  if (empty("OPENAI_API_KEY")) return report("OpenAI", null, "키 없음 (건너뜀)");
  const model = env.OPENAI_MODEL || "gpt-6-luna";
  // 쉼표로 여러 키를 넣을 수 있다 (앞 키 잔액이 떨어지면 다음 키 — src/lib/llm/client.ts). 키마다 확인, 키 값은 출력하지 않는다
  const keys = env.OPENAI_API_KEY.split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  for (const [i, key] of keys.entries()) {
    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        input: "Reply with the single word: ok",
        max_output_tokens: 16,
      }),
    });
    const body = await res.json().catch(() => ({}));
    const name = keys.length > 1 ? `OpenAI 키 ${i + 1}번` : "OpenAI";
    report(
      name,
      res.ok,
      res.ok
        ? `모델 ${model} 응답함`
        : `HTTP ${res.status} ${body.error?.code ?? ""} ${hide(body.error?.message?.slice(0, 120) ?? "")}`,
    );
  }
}

// 주가 — 금융위원회_주식시세정보 V2 (TECH §3.2). 공공데이터포털에서 이 API를 따로 활용신청해야 한다
async function stockPrice() {
  if (empty("DATA_GO_KR_SERVICE_KEY")) return report("주가(금융위)", null, "키 없음 (건너뜀)");
  const key = env.DATA_GO_KR_SERVICE_KEY;
  const serviceKey = key.includes("%") ? key : encodeURIComponent(key);
  const url = `https://apis.data.go.kr/1160100/GetStockSecuritiesInfoService_V2/getStockPriceInfo_V2?serviceKey=${serviceKey}&resultType=json&numOfRows=1&pageNo=1&likeSrtnCd=000660`;
  const res = await fetch(url);
  const text = await res.text();
  let item = null;
  try {
    item = JSON.parse(text)?.response?.body?.items?.item?.[0] ?? null;
  } catch {
    // 오류는 JSON 형식이 다르거나 XML로 온다
  }
  if (!item) {
    const hint = text.includes("SERVICE_KEY_IS_NOT_REGISTERED")
      ? "등록되지 않은 서비스키 → 「금융위원회_주식시세정보」 활용신청 여부 확인"
      : hide(text).replace(/\s+/g, " ").slice(0, 120);
    return report("주가(금융위)", false, `HTTP ${res.status} ${hint}`);
  }
  report(
    "주가(금융위)",
    true,
    `${item.itmsNm} ${item.basDt} 종가 ${Number(item.clpr).toLocaleString("ko-KR")}원, 상장주식수 ${"lstgStCnt" in item ? "있음" : "없음"}`,
  );
}

// 뉴스 — Google 뉴스 RSS (키 없음, TECH §3.3)
async function googleNews() {
  const res = await fetch(
    `https://news.google.com/rss/search?q=${encodeURIComponent("SK하이닉스 when:7d")}&hl=ko&gl=KR&ceid=KR:ko`,
  );
  const count = ((await res.text()).match(/<item>/g) ?? []).length;
  report("뉴스(Google RSS)", res.ok && count > 0, `HTTP ${res.status}, 최근 7일 기사 ${count}건`);
}

// Supabase — 공개 키로 인증 설정 읽기, 비밀 키로 관리자 API 호출
async function supabase() {
  if (empty("NEXT_PUBLIC_SUPABASE_URL")) return report("Supabase", null, "주소 없음 (건너뜀)");
  const base = env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
  if (!empty("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")) {
    const res = await fetch(`${base}/auth/v1/settings`, {
      headers: { apikey: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY },
    });
    const body = await res.json().catch(() => ({}));
    report(
      "Supabase 공개 키",
      res.ok,
      res.ok
        ? `구글 로그인 ${body.external?.google ? "켜짐" : "꺼짐"}, 이메일 가입 ${body.external?.email ? "켜짐(끄기 필요)" : "꺼짐"}`
        : `HTTP ${res.status}`,
    );
  }
  if (!empty("SUPABASE_SECRET_KEY")) {
    const res = await fetch(`${base}/auth/v1/admin/users?per_page=1`, {
      headers: {
        apikey: env.SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
      },
    });
    report("Supabase 비밀 키", res.ok, `HTTP ${res.status}`);
  }
}

for (const check of [opendart, openai, stockPrice, googleNews, supabase]) {
  try {
    await check();
  } catch (error) {
    report(check.name, false, `연결 실패: ${hide(String(error.message))}`);
  }
}

for (const [k, v] of Object.entries(env)) {
  if (/^["'].*["']$/.test(v))
    results.push({ name: k, ok: false, detail: "값에 따옴표가 있음 (빼 주세요)" });
}
for (const r of results)
  console.log(`${r.ok === null ? "—" : r.ok ? "✅" : "❌"} ${r.name}: ${r.detail}`);
