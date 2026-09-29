import type { Metadata } from "next";
import { Suspense } from "react";
import { TermsForm } from "./TermsForm";

export const metadata: Metadata = { title: "약관 동의" };

export default function OnboardingPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <Suspense>
        <TermsForm />
      </Suspense>
    </main>
  );
}
