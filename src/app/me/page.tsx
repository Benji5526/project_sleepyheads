import type { Metadata } from "next";
import { DeleteAccountSection } from "@/components/project/DeleteAccountSection";
import { MyProjects } from "@/components/project/MyProjects";

export const metadata: Metadata = { title: "내 분석" };

// /me — 내 프로젝트 최근순(P1) + 탈퇴(A6). 로그인은 src/proxy.ts가 확인한다 (WU-201·204)
export default function MePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">내 분석</h1>
      <MyProjects />
      <DeleteAccountSection />
    </main>
  );
}
