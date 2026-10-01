// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";

import type { AnalysisStatus } from "@/contracts";
import {
  AnalysisCanceledError,
  expireIdleRuns,
  IDLE_RUN_EXPIRE_MS,
  runOneStep,
  runStepRequest,
  type ToolTable,
} from "@/lib/runner/steps/engine";
import { buildStoredPlan } from "@/lib/runner/steps/plan";
import {
  DEFAULT_LIMITS,
  type AnalysisPatch,
  type EngineStore,
  type StepRow,
} from "@/lib/runner/steps/store";
import type { ToolName, ToolOutcome } from "@/lib/runner/tools/types";

import { skhynixRecent } from "../fixtures/mock/skhynix-recent";

// WU-501 작업 큐 보강 — 실제 Postgres(PGlite)에서. 엔진의 DB 접근을 운영 저장소(store.ts)와 같은 규칙의 SQL로 구현해
// (단계 줄 고유 키 + 상태·시작 시각 조건부 갱신, 분석 상태 조건부 갱신) 동시 요청·복구·취소·한도·오래된 running을 확인한다.

const ROOT = join(__dirname, "../../supabase");
const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PROJECT = "a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1";
const request = skhynixRecent.request!;
const VERSION = "44444444-4444-4444-8444-444444444444";

let db: PGlite;
let seq = 0;

// ── 운영 store.ts와 같은 규칙의 SQL 저장소 ──
const STEP_COLUMNS = `seq, tool, status, retries, input_summary, output_summary, output, duration_ms,
  error_reason, external_calls, llm_cost_usd, started_at`;

function toRow(r: Record<string, unknown>): StepRow {
  return {
    seq: r.seq as number,
    tool: r.tool as ToolName,
    status: r.status as StepRow["status"],
    retries: r.retries as number,
    inputSummary: r.input_summary as string,
    outputSummary: (r.output_summary as string | null) ?? null,
    output: r.output ?? null,
    durationMs: (r.duration_ms as number | null) ?? null,
    errorReason: (r.error_reason as string | null) ?? null,
    externalCalls: r.external_calls as number,
    llmCostUsd: Number(r.llm_cost_usd) || 0,
    startedAt: r.started_at ? new Date(r.started_at as string).toISOString() : null,
  };
}

const STEP_FIELD: Record<string, string> = {
  status: "status",
  retries: "retries",
  inputSummary: "input_summary",
  outputSummary: "output_summary",
  output: "output",
  durationMs: "duration_ms",
  errorReason: "error_reason",
  externalCalls: "external_calls",
  llmCostUsd: "llm_cost_usd",
  startedAt: "started_at",
  finishedAt: "finished_at",
};

function pgliteStore(): EngineStore {
  return {
    async loadAnalysis(id) {
      const { rows } = await db.query<Record<string, unknown>>(
        `select id, owner_id, status, question, mixed_scope, analysis_request, preprocess_decisions, plan
         from analyses where id = $1`,
        [id],
      );
      const r = rows[0];
      if (!r) return null;
      return {
        id: r.id as string,
        ownerId: r.owner_id as string,
        status: r.status as AnalysisStatus,
        question: r.question as string,
        mixedScope: (r.mixed_scope as boolean) ?? false,
        request: (r.analysis_request as never) ?? null,
        decisions: (r.preprocess_decisions as never) ?? null,
        plan: (r.plan as never) ?? null,
      };
    },
    async updateAnalysis(id, patch: AnalysisPatch, onlyIf) {
      const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
      const sets = entries.map(([k], i) => `${k} = $${i + 2}`);
      const values = entries.map(([, v]) =>
        v !== null && typeof v === "object" ? JSON.stringify(v) : v,
      );
      const where = onlyIf ? ` and status = any($${entries.length + 2}::text[])` : "";
      const res = await db.query(
        `update analyses set ${[...sets, "updated_at = now()"].join(", ")} where id = $1${where}`,
        [id, ...values, ...(onlyIf ? [onlyIf] : [])],
      );
      return (res.affectedRows ?? 0) > 0;
    },
    async listSteps(analysisId) {
      const { rows } = await db.query<Record<string, unknown>>(
        `select ${STEP_COLUMNS} from analysis_steps where analysis_id = $1 order by seq`,
        [analysisId],
      );
      return rows.map(toRow);
    },
    async listIdleRuns(ownerId, before) {
      const { rows } = await db.query<{ id: string }>(
        `select id from analyses where owner_id = $1 and status in ('queued','running')
         and updated_at < $2 order by updated_at limit 20`,
        [ownerId, before],
      );
      return rows.map((r) => r.id);
    },
    async insertStep(analysisId, ownerId, row) {
      try {
        await db.query(
          `insert into analysis_steps (analysis_id, owner_id, seq, tool, status, retries, input_summary,
             output_summary, output, duration_ms, error_reason, started_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
          [
            analysisId,
            ownerId,
            row.seq,
            row.tool,
            row.status,
            row.retries,
            row.inputSummary,
            row.outputSummary,
            row.output === null ? null : JSON.stringify(row.output),
            row.durationMs,
            row.errorReason,
            row.startedAt,
          ],
        );
        return true;
      } catch (err) {
        if ((err as { code?: string }).code === "23505") return false;
        throw err;
      }
    },
    async updateStep(analysisId, stepSeq, patch, expect) {
      const entries = Object.entries(patch).filter(([k, v]) => v !== undefined && STEP_FIELD[k]);
      const sets = entries.map(([k], i) => `${STEP_FIELD[k]} = $${i + 3}`);
      const values = entries.map(([k, v]) =>
        k === "output" && v !== null ? JSON.stringify(v) : v,
      );
      let where = "";
      const extra: unknown[] = [];
      if (expect) {
        extra.push(expect.status);
        where += ` and status = $${entries.length + 3}`;
        if (expect.startedAt !== undefined) {
          extra.push(expect.startedAt);
          where += ` and started_at is not distinct from $${entries.length + 4}::timestamptz`;
        }
      }
      const res = await db.query(
        `update analysis_steps set ${sets.join(", ")} where analysis_id = $1 and seq = $2${where}`,
        [analysisId, stepSeq, ...values, ...extra],
      );
      return (res.affectedRows ?? 0) > 0;
    },
    async loadLimits() {
      return DEFAULT_LIMITS;
    },
    async saveDataVersion(params) {
      await db.query(
        `insert into dataset_versions (id, owner_id, sources, calc_version, hash)
         values ($1, $2, '[]', 'v3', $3) on conflict do nothing`,
        [params.id, params.ownerId, params.hash],
      );
    },
    async findReusableExplanation() {
      return null;
    },
    async hasReusableCandidate() {
      return false;
    },
  };
}

// ── 가짜 도구 ──
let calls: ToolName[] = [];
let delayMs = 0;
let scripted: Partial<Record<ToolName, ToolOutcome[]>> = {};
let onRun: Partial<Record<ToolName, () => Promise<void>>> = {};

function ok(tool: ToolName): ToolOutcome {
  const outputs: Record<string, unknown> = {
    get_financials: { companies: [request.target], sources: [] },
    build_result: {
      result: { basis: { dataVersionId: VERSION }, figures: {}, charts: [] },
      version: { sources: [], calcVersion: "v3", priceDate: null, decisions: {} },
      versionHash: "hash",
      diagnoses: [],
    },
    write_explanation: { explanation: { status: "ready", label: "AI 작성", conclusion: ["설명"] } },
  };
  return {
    status: "succeeded",
    output: outputs[tool] ?? {},
    inputSummary: tool,
    outputSummary: tool,
    usage: { externalCalls: 1, llmCostUsd: 0 },
  } as ToolOutcome;
}

const tools = Object.fromEntries(
  (
    [
      "get_peers",
      "get_financials",
      "get_disclosures",
      "search_news",
      "build_result",
      "write_explanation",
    ] as ToolName[]
  ).map((tool) => [
    tool,
    async () => {
      calls.push(tool);
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      await onRun[tool]?.();
      return scripted[tool]?.shift() ?? ok(tool);
    },
  ]),
) as unknown as ToolTable;

const deps = () => ({ store: pgliteStore(), tools, client: {} as SupabaseClient });

async function newAnalysis(
  status: AnalysisStatus = "queued",
  options: { idleMinutes?: number } = {},
) {
  seq += 1;
  const id = `bbbbbbbb-bbbb-4bbb-8bbb-${String(seq).padStart(12, "0")}`;
  await db.query(
    `insert into analyses (id, project_id, owner_id, question, status, idempotency_key, analysis_request, plan, updated_at)
     values ($1, $2, $3, '질문', $4, $5, $6, $7, now() - make_interval(mins => $8))`,
    [
      id,
      PROJECT,
      USER,
      status,
      `k-${id}`,
      JSON.stringify(request),
      JSON.stringify(buildStoredPlan(request)),
      options.idleMinutes ?? 0,
    ],
  );
  return id;
}

async function analysisRow(id: string) {
  const { rows } = await db.query<{ status: string; stop_reason: string | null; result: unknown }>(
    "select status, stop_reason, result from analyses where id = $1",
    [id],
  );
  return rows[0];
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  const dir = join(ROOT, "migrations");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(readFileSync(join(dir, file), "utf8"));
  }
  await db.exec(readFileSync(join(ROOT, "seed.sql"), "utf8"));
  await db.query("insert into auth.users values ($1, 'a@example.com')", [USER]);
  await db.query("insert into profiles (id, email) values ($1, 'a@example.com')", [USER]);
  await db.query("insert into projects (id, owner_id) values ($1, $2)", [PROJECT, USER]);
}, 60_000);

beforeEach(() => {
  calls = [];
  delayMs = 0;
  scripted = {};
  onRun = {};
});

describe("WU-501 작업 큐 — 실제 Postgres", () => {
  it("같은 단계를 동시에 두 번 불러도 한 번만 실행된다 (단계 줄 고유 키)", async () => {
    const id = await newAnalysis();
    delayMs = 50;
    const [a, b] = await Promise.all([runOneStep(id, deps()), runOneStep(id, deps())]);
    expect(calls.filter((t) => t === "get_financials")).toHaveLength(1);
    // 진 쪽은 실행하지 않고 진행 상태만 (next: step)
    expect([a.next, b.next]).toEqual(["step", "step"]);
    expect([a.lastStep?.status, b.lastStep?.status]).toContain("running");
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int n from analysis_steps where analysis_id = $1",
      [id],
    );
    expect(rows[0].n).toBe(1);
  });

  it("창을 닫았다 다시 열면(새 요청) 마지막 성공 단계 다음부터, 앞 결과는 DB에서 읽는다", async () => {
    const id = await newAnalysis();
    await runOneStep(id, deps()); // 1단계 성공 후 창을 닫음
    calls = [];
    const res = await runStepRequest(id, deps()); // 다시 열어 이어서
    expect(calls).toEqual(["build_result", "write_explanation"]);
    expect(res.status).toBe("succeeded");
  });

  it("같은 멱등키로 두 번 제출해도 분석은 하나 (owner_id, idempotency_key 고유)", async () => {
    const insert = () =>
      db.query(
        `insert into analyses (project_id, owner_id, question, status, idempotency_key)
         values ($1, $2, '같은 질문', 'queued', 'same-key')`,
        [PROJECT, USER],
      );
    await insert();
    await expect(insert()).rejects.toMatchObject({ code: "23505" });
    const { rows } = await db.query<{ n: number }>(
      "select count(*)::int n from analyses where idempotency_key = 'same-key'",
    );
    expect(rows[0].n).toBe(1);
  });

  it("장시간 단계 중 취소 → 그 단계 결과는 버리고, 이후 외부 호출 0건, running으로 남지 않는다", async () => {
    const id = await newAnalysis();
    onRun.get_financials = async () => {
      // 긴 수집 도중 사용자가 [취소] (Q8이 하는 일)
      await db.query(
        "update analyses set status = 'canceled', stop_reason = 'USER_CANCELED' where id = $1",
        [id],
      );
    };
    const res = await runStepRequest(id, deps());
    expect(res).toMatchObject({ status: "canceled", next: "done" });
    const before = calls.length;
    await expect(runOneStep(id, deps())).rejects.toBeInstanceOf(AnalysisCanceledError);
    expect(calls.length).toBe(before);
    expect((await analysisRow(id)).status).toBe("canceled");
    const { rows } = await db.query<{ status: string }>(
      "select status from analysis_steps where analysis_id = $1",
      [id],
    );
    expect(rows.map((r) => r.status)).toEqual(["skipped"]);
  });

  it("외부 API 한도 초과 흉내 → failed로 끝나고, 다시 불러도 재시도가 반복되지 않는다", async () => {
    const id = await newAnalysis();
    scripted.get_financials = [
      { status: "failed", retryable: false, errorReason: "오늘 OpenDART 한도 초과" },
    ];
    const res = await runStepRequest(id, deps());
    expect(res.status).toBe("failed");
    expect(calls).toEqual(["get_financials"]);
    // 화면이 다시 열려 Q4가 와도 도구를 부르지 않는다
    const again = await runStepRequest(id, deps());
    expect(again).toMatchObject({ status: "failed", next: "done" });
    expect(calls).toEqual(["get_financials"]);
  });
});

describe("WU-501 오래된 running 정리 (HANDOFF §0.4)", () => {
  it("1시간 넘게 아무 단계도 진행하지 않은 running은 TIMEOUT 실패로, 최근 것은 그대로", async () => {
    const stale = await newAnalysis("running", { idleMinutes: 90 });
    const fresh = await newAnalysis("running", { idleMinutes: 5 });
    const expired = await expireIdleRuns(USER, deps());
    expect(expired).toBeGreaterThanOrEqual(1);
    expect(await analysisRow(stale)).toMatchObject({ status: "failed", stop_reason: "TIMEOUT" });
    expect((await analysisRow(fresh)).status).toBe("running");
  });

  it("방금 시작한 긴 단계가 있으면 분석 시각이 오래돼도 건드리지 않는다", async () => {
    const id = await newAnalysis("running", { idleMinutes: 90 });
    await db.query(
      `insert into analysis_steps (analysis_id, owner_id, seq, tool, status, started_at)
       values ($1, $2, 1, 'get_financials', 'running', now())`,
      [id, USER],
    );
    await expireIdleRuns(USER, deps());
    expect((await analysisRow(id)).status).toBe("running");
  });

  it("결과 단계까지 끝났으면 결과를 살려 부분 결과(TIMEOUT)로", async () => {
    const id = await newAnalysis("running");
    await runOneStep(id, deps());
    await runOneStep(id, deps()); // build_result까지 — 분석 글 앞에서 창을 닫음
    await db.exec(`
      update analyses set updated_at = now() - interval '2 hours' where id = '${id}';
      update analysis_steps set started_at = now() - interval '2 hours' where analysis_id = '${id}';
    `);
    await expireIdleRuns(USER, deps());
    const row = await analysisRow(id);
    expect(row).toMatchObject({ status: "partial", stop_reason: "TIMEOUT" });
    expect(row.result).not.toBeNull();
    const { rows } = await db.query<{ error_reason: string | null }>(
      "select error_reason from analysis_steps where analysis_id = $1 and seq = 3",
      [id],
    );
    expect(rows[0].error_reason).toContain("1시간");
  });

  it("정리 기준은 1시간", () => {
    expect(IDLE_RUN_EXPIRE_MS).toBe(60 * 60_000);
  });
});
