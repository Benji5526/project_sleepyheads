import type { Metadata } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import { MockBanner } from "@/components/layout/MockBanner";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import { SessionProvider } from "@/components/session/SessionProvider";
import "./globals.css";

// 숫자 자릿수가 고른 한글 글꼴 하나로 통일한다
const plexKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "sleepyheads — 공시로 답하는 기업 분석",
    template: "%s | sleepyheads",
  },
  description: "기업 이름과 궁금한 점을 입력하면 전자공시 숫자로 계산한 차트와 분석 글로 답합니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${plexKr.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <SessionProvider>
          <MockBanner />
          <SiteHeader />
          <div className="flex flex-1 flex-col">{children}</div>
          <SiteFooter />
        </SessionProvider>
      </body>
    </html>
  );
}
