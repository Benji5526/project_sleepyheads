"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/components/session/SessionProvider";

export function SiteHeader() {
  const { status, usage, signOut } = useSession();
  const pathname = usePathname();
  const remaining = usage ? usage.questionsLimit - usage.questionsUsed : null;

  return (
    <header className="border-b border-line bg-surface">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="text-lg font-bold tracking-tight">
          sleepyheads
        </Link>

        <div className="flex items-center gap-3 text-sm">
          {status === "ready" && usage && remaining !== null && (
            <p
              className={remaining === 0 ? "text-danger" : "text-muted"}
              aria-live="polite"
              data-testid="questions-remaining"
            >
              오늘 남은 질문{" "}
              <span className="font-semibold text-ink">
                {remaining}/{usage.questionsLimit}
              </span>
            </p>
          )}
          {(status === "ready" || status === "needs_terms") && (
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-md px-2 py-1 text-muted hover:bg-paper hover:text-ink"
            >
              로그아웃
            </button>
          )}
          {status === "anonymous" && pathname !== "/login" && (
            <Link
              href={`/login?next=${encodeURIComponent(pathname)}`}
              className="rounded-md bg-accent px-3 py-1.5 font-medium text-accent-ink hover:opacity-90"
            >
              로그인
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
