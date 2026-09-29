"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSession } from "@/components/session/SessionProvider";
import { safeNextPath } from "@/lib/api-client/safe-next";
import { agreeTerms } from "@/lib/api-client/session";

export function TermsForm() {
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));
  const { refresh } = useSession();
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!terms || !privacy) return;
    setPending(true);
    setError(null);
    try {
      await agreeTerms();
      await refresh();
      router.replace(next);
    } catch {
      setError("동의 내용을 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="w-full max-w-md rounded-xl border border-line bg-surface p-8"
    >
      <h1 className="text-xl font-bold">서비스 이용 동의</h1>
      <p className="mt-2 leading-7 text-muted">처음 한 번만 동의하면 바로 질문할 수 있습니다.</p>

      <fieldset className="mt-6 space-y-3">
        <legend className="sr-only">필수 동의 항목</legend>
        <Agreement
          checked={terms}
          onChange={setTerms}
          label="이용약관에 동의합니다"
          href="/terms"
          linkLabel="이용약관 보기"
        />
        <Agreement
          checked={privacy}
          onChange={setPrivacy}
          label="개인정보 수집·이용에 동의합니다"
          href="/privacy"
          linkLabel="개인정보 처리방침 보기"
        />
      </fieldset>

      <button
        type="submit"
        disabled={!terms || !privacy || pending}
        className="mt-6 h-11 w-full rounded-lg bg-accent font-medium text-accent-ink hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {pending ? "저장하는 중…" : "동의하고 시작하기"}
      </button>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

function Agreement(props: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border border-line p-3">
      <label className="flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={props.checked}
          onChange={(e) => props.onChange(e.target.checked)}
          className="mt-1 size-4 accent-[var(--accent)]"
        />
        <span>
          <span className="text-sm font-semibold text-accent">필수</span> {props.label}
        </span>
      </label>
      <Link
        href={props.href}
        target="_blank"
        className="shrink-0 text-sm text-muted underline underline-offset-4 hover:text-ink"
      >
        {props.linkLabel}
      </Link>
    </div>
  );
}
