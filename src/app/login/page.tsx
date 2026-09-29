import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginPanel } from "./LoginPanel";

export const metadata: Metadata = { title: "로그인" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Suspense>
        <LoginPanel />
      </Suspense>
    </main>
  );
}
