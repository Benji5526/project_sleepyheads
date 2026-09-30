"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { ProjectDetail, ProjectSummary } from "@/contracts";
import { ErrorCard } from "@/components/ask/ErrorCard";
import { describeError, formatKstTime, type ErrorNotice } from "@/components/ask/errorMessages";
import { ApiRequestError } from "@/lib/api-client/errors";
import { getProject, listProjects } from "@/lib/api-client/projects";
import { QuestionHistory } from "./QuestionHistory";

type ListState =
  | { kind: "loading" }
  | { kind: "ready"; items: ProjectSummary[]; nextCursor: string | null }
  | { kind: "error"; notice: ErrorNotice };

/** 내 프로젝트 목록 (P1, 최근 활동순). 누르면 그 프로젝트의 질문 기록(P2)이 펼쳐지고, 질문을 누르면 열린다 */
export function MyProjects() {
  const router = useRouter();
  const [state, setState] = useState<ListState>({ kind: "loading" });
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreNotice, setMoreNotice] = useState<ErrorNotice | null>(null);

  useEffect(() => {
    let active = true;
    listProjects()
      .then(({ items, nextCursor }) => {
        if (active) setState({ kind: "ready", items, nextCursor });
      })
      .catch((error: unknown) => {
        if (!active) return;
        if (error instanceof ApiRequestError && error.code === "UNAUTHORIZED") {
          router.replace(`/login?next=${encodeURIComponent("/me")}`);
          return;
        }
        if (error instanceof ApiRequestError && error.code === "TERMS_REQUIRED") {
          router.replace(`/onboarding?next=${encodeURIComponent("/me")}`);
          return;
        }
        setState({ kind: "error", notice: describeError(error) });
      });
    return () => {
      active = false;
    };
  }, [router]);

  async function loadMore() {
    if (state.kind !== "ready" || !state.nextCursor || loadingMore) return;
    setLoadingMore(true);
    setMoreNotice(null);
    try {
      const page = await listProjects(state.nextCursor);
      setState({
        kind: "ready",
        items: [...state.items, ...page.items],
        nextCursor: page.nextCursor,
      });
    } catch (error) {
      // 이미 보이는 목록은 그대로 두고 더 보기 아래에만 안내한다 (다시 누르면 재시도)
      setMoreNotice(describeError(error));
    } finally {
      setLoadingMore(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <p role="status" className="mt-6 flex items-center gap-3 text-muted">
        <span
          aria-hidden="true"
          className="size-4 animate-spin rounded-full border-2 border-line border-t-accent"
        />
        내 분석을 불러오는 중입니다.
      </p>
    );
  }

  if (state.kind === "error") {
    return (
      <div className="mt-6">
        <ErrorCard notice={state.notice} />
      </div>
    );
  }

  if (state.items.length === 0) {
    return (
      <section className="mt-6 rounded-xl border border-line bg-surface p-6">
        <h2 className="font-semibold">아직 저장된 분석이 없습니다</h2>
        <p className="mt-1 text-muted">질문하면 여기에 최근순으로 쌓입니다.</p>
        <Link
          href="/"
          className="mt-4 inline-flex h-10 items-center rounded-lg bg-accent px-4 font-medium text-accent-ink hover:opacity-90"
        >
          질문하러 가기
        </Link>
      </section>
    );
  }

  return (
    <section aria-label="내 프로젝트" className="mt-6">
      <p className="text-sm text-muted">최근에 질문한 순서입니다. 누르면 질문 기록이 펼쳐집니다.</p>
      <ul className="mt-3 space-y-3">
        {state.items.map((project) => (
          <ProjectRow key={project.id} project={project} />
        ))}
      </ul>
      {state.nextCursor && (
        <button
          type="button"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          className="mt-4 h-10 rounded-lg border border-line bg-surface px-4 font-medium hover:border-accent hover:text-accent disabled:opacity-50"
        >
          {loadingMore ? "불러오는 중…" : "더 보기"}
        </button>
      )}
      {moreNotice && (
        <div className="mt-4">
          <ErrorCard notice={moreNotice} />
        </div>
      )}
    </section>
  );
}

type DetailState =
  | { kind: "closed" }
  | { kind: "loading" }
  | { kind: "ready"; detail: ProjectDetail }
  | { kind: "error"; notice: ErrorNotice };

function ProjectRow({ project }: { project: ProjectSummary }) {
  const [detail, setDetail] = useState<DetailState>({ kind: "closed" });
  const open = detail.kind !== "closed";
  const panelId = `project-${project.id}`;
  // 불러오는 중에 접었다 펼치면 늦게 온 이전 응답은 버린다 (접힌 줄이 저절로 다시 펼쳐지지 않게)
  const request = useRef(0);

  async function toggle() {
    const seq = ++request.current;
    if (open) {
      setDetail({ kind: "closed" });
      return;
    }
    setDetail({ kind: "loading" });
    try {
      const { data } = await getProject(project.id);
      if (seq === request.current) setDetail({ kind: "ready", detail: data });
    } catch (error) {
      if (seq === request.current) setDetail({ kind: "error", notice: describeError(error) });
    }
  }

  return (
    <li className="rounded-xl border border-line bg-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => void toggle()}
        className="flex w-full items-start justify-between gap-3 rounded-xl px-4 py-3 text-left hover:bg-paper"
      >
        <span className="min-w-0">
          <span className="block break-words font-medium">{project.title ?? "제목 없는 분석"}</span>
          <span className="mt-0.5 block text-sm text-muted">
            {[
              project.targetName,
              `질문 ${project.analysisCount}개`,
              formatKstTime(project.updatedAt),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span aria-hidden="true" className="mt-1 shrink-0 text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>
      <div id={panelId} hidden={!open} className="border-t border-line px-2 py-2">
        {detail.kind === "loading" && (
          <p role="status" className="px-3 py-2 text-sm text-muted">
            질문 기록을 불러오는 중입니다.
          </p>
        )}
        {detail.kind === "error" && <ErrorCard notice={detail.notice} />}
        {detail.kind === "ready" && (
          <QuestionHistory
            projectId={project.id}
            analyses={detail.detail.analyses}
            label={`${project.title ?? "분석"}의 질문`}
          />
        )}
      </div>
    </li>
  );
}
