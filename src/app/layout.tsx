import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "sleepyheads — 질문형 기업 분석",
  description:
    "공시 숫자와 뉴스 단서로 답하는 질문형 기업 분석 서비스 (비상업 수업용)",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
