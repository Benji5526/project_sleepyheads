import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";

// DB 테스트 공용 준비: 실제 Postgres(PGlite, 메모리)에 supabase/migrations 전체 + seed.sql을 순서대로 적용한다.
// 운영 DB는 하나뿐이라(sleepyhead, API_SPEC §7.1) 거기서 시험하지 않는다.

export const SUPABASE_DIR = join(__dirname, "../../../supabase");

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm } });
  // Supabase가 미리 만들어 두는 역할·auth 스키마·권한 흉내.
  // 운영처럼 authenticated·anon 역할도 public 테이블 권한을 갖고, 행은 RLS가 거른다.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const dir = join(SUPABASE_DIR, "migrations");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.exec(readFileSync(join(SUPABASE_DIR, "seed.sql"), "utf8"));
  await db.exec(`
    grant usage on schema public to anon, authenticated, service_role;
    grant all on all tables in schema public to anon, authenticated, service_role;
    grant usage on schema auth to authenticated;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  return db;
}

// 로그인 계정 + profiles 행 (로그인 콜백이 만드는 것과 같게)
export async function addMember(db: PGlite, id: string, email: string): Promise<void> {
  await db.query("insert into auth.users values ($1, $2)", [id, email]);
  await db.query("insert into profiles (id, email, agreed_terms_at) values ($1, $2, now())", [
    id,
    email,
  ]);
}

// 이 회원으로 로그인한 요청처럼 실행한다: authenticated 역할 + JWT sub (RLS가 auth.uid()로 판정)
export async function asMember<T>(
  db: PGlite,
  userId: string,
  fn: (tx: Pick<PGlite, "query" | "exec">) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`set local role authenticated`);
    await tx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    return fn(tx);
  });
}
