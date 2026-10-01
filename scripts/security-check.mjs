#!/usr/bin/env node
// WU-505 배포 전 보안 점검 — 자동으로 확인할 수 있는 부분 (DevelopDoc/SECURITY_CHECK.md ①·비밀 값 검사).
//
//   node scripts/security-check.mjs                 # 빌드 결과(.next/static) + 저장소 전체·커밋 기록
//   node scripts/security-check.mjs --url https://projectsleepyheads.vercel.app   # 운영 주소의 실제 JS도
//
// 1) 브라우저 번들: Supabase publishable key(브라우저용, 공개 가능) 외의 키 모양이 없어야 한다
//    - 키 모양: OpenAI `sk-…`, Supabase 비밀 키 `sb_secret_…`, service_role JWT(내용을 풀어 role 확인)
//    - 값 대조: .env.local·환경변수에 있는 서버 전용 비밀 값(이름이 NEXT_PUBLIC_이 아닌 것)이 번들에 그대로 있는지
// 2) 저장소 전체(작업 트리 + 모든 커밋 기록)에 같은 키 모양·비밀 값이 없는지
// 비밀 값은 **절대 출력하지 않는다** — 찾으면 종류와 위치(파일·커밋)만. 하나라도 있으면 종료 코드 1.
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const urlIndex = args.indexOf("--url");
const siteUrl = urlIndex >= 0 ? args[urlIndex + 1] : null;
if (urlIndex >= 0 && !/^https?:\/\//.test(siteUrl ?? "")) {
  console.error("사용법: node scripts/security-check.mjs [--url https://운영주소]");
  process.exit(2);
}

// 서버 전용 비밀 값의 이름 (API_SPEC §8.3). 값이 8자 이상일 때만 대조한다
const SECRET_NAMES = [
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "OPENDART_API_KEY",
  "DATA_GO_KR_SERVICE_KEY",
  "OPENAI_API_KEY",
  "CRON_SECRET",
  "NAVER_CLIENT_SECRET",
];

const PATTERNS = [
  { kind: "OpenAI 키(sk-…)", re: /\bsk-(?:proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}/g },
  { kind: "Supabase 비밀 키(sb_secret_…)", re: /\bsb_secret_[A-Za-z0-9_-]{10,}/g },
  { kind: "JWT", re: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
];

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

/** 대조할 비밀 값 목록 (값 자체는 메모리에만, 출력하지 않는다) */
function secretValues() {
  const env = { ...readEnvFile(join(ROOT, ".env.local")), ...process.env };
  const values = [];
  for (const name of SECRET_NAMES) {
    // OPENAI_API_KEY는 쉼표로 여러 키
    for (const v of String(env[name] ?? "")
      .split(",")
      .map((s) => s.trim())) {
      if (v.length >= 8) values.push({ name, value: v });
    }
  }
  return values;
}

function jwtRole(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

/** 한 덩어리 글에서 찾은 것 (값은 빼고 종류만) */
function scanText(text, secrets) {
  const hits = [];
  for (const { kind, re } of PATTERNS) {
    for (const match of text.matchAll(re)) {
      if (kind === "JWT") {
        const role = jwtRole(match[0]);
        // anon(공개 가능한 옛 publishable 키) JWT는 브라우저에 있어도 된다 — service_role만 문제
        if (role === "service_role") hits.push("service_role JWT");
        continue;
      }
      hits.push(kind);
    }
  }
  for (const { name, value } of secrets) {
    if (text.includes(value)) hits.push(`${name}의 값`);
  }
  return [...new Set(hits)];
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const findings = [];
const secrets = secretValues();
console.log(`대조할 서버 비밀 값: ${secrets.length}개 (.env.local·환경변수 — 값은 출력하지 않음)`);

// ── 1) 빌드 결과 ──
const staticDir = join(ROOT, ".next", "static");
const bundleFiles = walk(staticDir).filter((f) => /\.(js|css|json|html|txt|map)$/.test(f));
if (bundleFiles.length === 0) {
  console.log("① 빌드 결과: .next/static 없음 — 먼저 `pnpm build`");
} else {
  let bad = 0;
  for (const file of bundleFiles) {
    const hits = scanText(readFileSync(file, "utf8"), secrets);
    if (hits.length) {
      bad += 1;
      findings.push({ where: `번들 ${relative(ROOT, file)}`, hits });
    }
  }
  console.log(`① 빌드 결과(.next/static): 파일 ${bundleFiles.length}개 검사 → 걸린 파일 ${bad}개`);
}

// ── 1') 운영 주소의 실제 JS (공개 파일만 받는다) ──
if (siteUrl) {
  const base = new URL(siteUrl);
  const pages = ["/", "/login", "/terms", "/privacy"];
  const scripts = new Set();
  for (const page of pages) {
    const res = await fetch(new URL(page, base));
    const html = await res.text();
    for (const m of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+\.js)"/g))
      scripts.add(m[1]);
    const hits = scanText(html, secrets);
    if (hits.length) findings.push({ where: `운영 HTML ${page}`, hits });
  }
  let bad = 0;
  for (const path of scripts) {
    const body = await (await fetch(new URL(path, base))).text();
    const hits = scanText(body, secrets);
    if (hits.length) {
      bad += 1;
      findings.push({ where: `운영 JS ${path}`, hits });
    }
  }
  console.log(`①' 운영 주소 ${base.origin}: JS ${scripts.size}개 검사 → 걸린 파일 ${bad}개`);
}

// ── 2) 저장소 전체 + 커밋 기록 ──
function git(argsList) {
  return execFileSync("git", argsList, { cwd: ROOT, maxBuffer: 1024 * 1024 * 512 }).toString(
    "utf8",
  );
}
const tracked = git(["ls-files"]).split("\n").filter(Boolean);
let trackedBad = 0;
const skippedLarge = [];
for (const file of tracked) {
  const path = join(ROOT, file);
  if (!existsSync(path)) continue;
  // 아주 큰 파일은 따로 알린다 (조용히 건너뛰면 "없음"이 거짓이 될 수 있다)
  if (statSync(path).size > 5_000_000) {
    skippedLarge.push(file);
    continue;
  }
  const hits = scanText(readFileSync(path, "utf8"), secrets);
  if (hits.length) {
    trackedBad += 1;
    findings.push({ where: `작업 트리 ${file}`, hits });
  }
}
console.log(`② 저장소 작업 트리: 파일 ${tracked.length}개 검사 → 걸린 파일 ${trackedBad}개`);
if (skippedLarge.length) {
  console.log(
    `   ⚠️ 5MB 넘어 검사하지 않은 파일 ${skippedLarge.length}개 — 직접 확인: ${skippedLarge.join(", ")}`,
  );
}

// 커밋마다 추가된 줄만 본다 (지워진 줄도 기록에 남으므로 +·- 둘 다)
const log = git(["log", "--all", "-p", "--no-color", "--format=@@COMMIT %H"]);
let commit = "";
let commitsBad = 0;
const perCommit = new Map();
for (const line of log.split("\n")) {
  if (line.startsWith("@@COMMIT ")) {
    commit = line.slice(9, 17);
    continue;
  }
  if (
    !(line.startsWith("+") || line.startsWith("-")) ||
    line.startsWith("+++") ||
    line.startsWith("---")
  )
    continue;
  const hits = scanText(line, secrets);
  if (hits.length) perCommit.set(commit, new Set([...(perCommit.get(commit) ?? []), ...hits]));
}
for (const [hash, hits] of perCommit) {
  commitsBad += 1;
  findings.push({ where: `커밋 ${hash}`, hits: [...hits] });
}
const commitCount = git(["rev-list", "--all", "--count"]).trim();
console.log(`② 커밋 기록: 커밋 ${commitCount}개 검사 → 걸린 커밋 ${commitsBad}개`);

if (findings.length) {
  console.log("\n⚠️ 찾은 것 (값은 출력하지 않음 — 노출된 키는 재발급):");
  for (const f of findings) console.log(`- ${f.where}: ${f.hits.join(", ")}`);
  process.exit(1);
}
console.log("\n✅ 키 모양·서버 비밀 값 없음");
