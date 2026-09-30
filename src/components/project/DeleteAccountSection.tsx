"use client";

import { useEffect, useRef, useState } from "react";
import { ErrorCard } from "@/components/ask/ErrorCard";
import { describeError, type ErrorNotice } from "@/components/ask/errorMessages";
import { DELETE_CONFIRM_WORD, deleteAccount } from "@/lib/api-client/projects";

/** 회원 탈퇴 (A6, WU-204). "되돌릴 수 없음" 확인 창에서 확인 문구를 직접 입력해야만 실행한다 */
export function DeleteAccountSection() {
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<ErrorNotice | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function close() {
    if (pending) return;
    setOpen(false);
    setTyped("");
    setNotice(null);
  }

  async function confirm() {
    if (typed.trim() !== DELETE_CONFIRM_WORD || pending) return;
    setPending(true);
    setNotice(null);
    try {
      await deleteAccount();
      // 계정과 세션이 모두 지워졌다. 회원 화면 내용이 남지 않게 첫 화면을 새로 불러온다 (로그아웃과 같게)
      window.location.replace("/");
    } catch (error) {
      setPending(false);
      setNotice(describeError(error));
    }
  }

  return (
    <section aria-labelledby="delete-account-title" className="mt-16 border-t border-line pt-8">
      <h2 id="delete-account-title" className="text-lg font-semibold">
        회원 탈퇴
      </h2>
      <p className="mt-1 leading-7 text-muted">
        탈퇴하면 저장된 분석·질문 기록·사용량과 로그인 정보가 모두 지워집니다.
      </p>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 h-10 rounded-lg border border-danger/50 px-4 font-medium text-danger hover:bg-danger/10"
      >
        탈퇴하기
      </button>

      <dialog
        ref={ref}
        onClose={close}
        onCancel={(event) => {
          if (pending) event.preventDefault();
        }}
        aria-labelledby="delete-dialog-title"
        className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl border border-line bg-surface p-0 text-ink shadow-xl backdrop:bg-black/40"
      >
        <div className="p-6">
          <h2 id="delete-dialog-title" className="text-lg font-semibold">
            정말 탈퇴할까요?
          </h2>
          <p className="mt-2 leading-7 text-muted">
            <strong className="text-danger">되돌릴 수 없습니다.</strong> 모든 분석과 질문 기록이
            바로 지워지고 다시 살릴 수 없습니다.
          </p>
          <label htmlFor="delete-confirm" className="mt-4 block text-sm">
            계속하려면 <strong>{DELETE_CONFIRM_WORD}</strong>라고 입력하세요.
          </label>
          <input
            id="delete-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            disabled={pending}
            autoComplete="off"
            className="mt-2 h-10 w-full rounded-lg border border-line bg-paper px-3 outline-none focus:border-accent"
          />
          {notice && (
            <div className="mt-4">
              <ErrorCard notice={notice} />
            </div>
          )}
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={close}
              disabled={pending}
              className="h-10 rounded-lg border border-line px-4 font-medium hover:bg-paper disabled:opacity-50"
            >
              취소
            </button>
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={pending || typed.trim() !== DELETE_CONFIRM_WORD}
              className="h-10 rounded-lg bg-danger px-4 font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending ? "지우는 중…" : "영구 탈퇴"}
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
