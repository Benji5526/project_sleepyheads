import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// WU-199 "자유 Python·SQL 생성·실행 경로가 없음을 확인했다" (TECH §0·§4.4)의 증거.
// 서버 코드 전체(src/)를 훑어, 문자열을 코드로 실행하는 길과 정해 두지 않은 DB 함수 호출이 없는지 본다.
const ROOT = join(__dirname, "..", "..", "src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const files = sourceFiles(ROOT).map((path) => ({
  path: relative(ROOT, path).replaceAll("\\", "/"),
  text: readFileSync(path, "utf8"),
}));

// 문자열을 코드로 돌리거나 다른 프로그램(파이썬 등)을 띄우는 방법들
const FORBIDDEN: { name: string; pattern: RegExp }[] = [
  { name: "eval()", pattern: /\beval\s*\(/ },
  { name: "new Function()", pattern: /\bnew\s+Function\s*\(/ },
  { name: "child_process (외부 프로그램 실행)", pattern: /["'](node:)?child_process["']/ },
  { name: "vm 모듈 (코드 실행)", pattern: /["'](node:)?vm["']/ },
  { name: "Python 실행기", pattern: /\b(pyodide|python-shell|spawn\(\s*["']python)/i },
  {
    name: "Postgres 직접 연결 (SQL 문자열 실행)",
    pattern: /["'](pg|postgres|@neondatabase\/serverless)["']/,
  },
];

// 서버가 부를 수 있는 DB 함수는 마이그레이션에 정의된 고정 목록뿐이다 (API_SPEC §7.3)
const ALLOWED_RPC = new Set([
  // WU-403 섹터 합계 (고정 SQL 함수, 인자는 분기·지표 목록만 — DB 함수가 지표 이름을 다시 검사한다)
  "aggregate_sector_metrics",
  "check_and_record_api_usage",
  "check_request_rate",
  "consume_quota",
  "delete_my_data",
  "record_decline",
  "refund_quota",
]);

describe("자유 코드·SQL 실행 경로 없음 (WU-199)", () => {
  it("src/ 파일을 실제로 훑었다", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(FORBIDDEN)("$name 을 쓰는 곳이 없다", ({ pattern }) => {
    const hits = files.filter((f) => pattern.test(f.text)).map((f) => f.path);
    expect(hits).toEqual([]);
  });

  it("DB 함수 호출(.rpc)은 정해 둔 이름만, 이름은 코드에 고정된 문자열로만 쓴다", () => {
    const calls = files.flatMap((f) =>
      [...f.text.matchAll(/\.rpc(?:<[^>]*>)?\(\s*([^,)]+)/g)].map((m) => ({
        path: f.path,
        arg: m[1].trim(),
      })),
    );
    expect(calls.length).toBeGreaterThan(0);
    for (const { path, arg } of calls) {
      const name = /^"([a-z_]+)"$/.exec(arg)?.[1];
      expect(name, `${path}: .rpc(${arg}) — 변수로 함수 이름을 넘기면 안 된다`).toBeDefined();
      expect(ALLOWED_RPC.has(name!), `${path}: 목록에 없는 DB 함수 ${name}`).toBe(true);
    }
  });
});
