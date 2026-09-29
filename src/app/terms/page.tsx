import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";
import { INVESTMENT_NOTICE } from "@/components/legal/notices";

export const metadata: Metadata = { title: "이용약관" };

export default function TermsPage() {
  return (
    <LegalDocument title="이용약관" effectiveDate="2026년 9월 28일">
      <section>
        <h2>제1조 목적</h2>
        <p>
          이 약관은 sleepyheads(이하 &ldquo;서비스&rdquo;)를 이용하는 조건과 절차, 이용자와 운영자의
          권리·의무를 정합니다. 서비스는 바이브코딩 수업을 위해 만든 비상업 프로젝트이며, 광고·유료
          기능이 없습니다.
        </p>
      </section>

      <section>
        <h2>제2조 서비스 내용</h2>
        <ul>
          <li>
            이용자가 국내 상장 주식회사(유가증권·코스닥)에 관해 질문하면, 금융감독원 전자공시(DART)
            등 공개 자료로 계산한 표·차트와 AI가 작성한 분석 글을 보여줍니다.
          </li>
          <li>
            분석 글의 &ldquo;투자 포인트&rdquo;는 계산된 숫자가 사업에 무엇을 뜻하는지에 대한
            해석으로, 매수·매도·보유 의견이나 목표주가·주가 예상을 담지 않습니다. 추정이 들어간
            문장에는 &ldquo;추정&rdquo;을 표시합니다.
          </li>
          <li>
            기업 분석과 관계없는 질문, 매수·매도 판단이나 목표주가 같은 투자 권유 요청에는 답하지
            않으며, 정해진 안내 문구로 대신합니다.
          </li>
          <li>서비스 내용은 수업 진행에 따라 예고 없이 바뀌거나 중단될 수 있습니다.</li>
        </ul>
      </section>

      <section>
        <h2>제3조 투자 판단 책임</h2>
        <p>{INVESTMENT_NOTICE}</p>
      </section>

      <section>
        <h2>제4조 회원 가입과 로그인</h2>
        <ul>
          <li>
            회원 가입과 로그인은 구글 계정으로만 할 수 있습니다. 서비스는 비밀번호를 저장하지
            않습니다.
          </li>
          <li>
            처음 로그인할 때 이 약관과 개인정보 처리방침에 동의해야 서비스를 이용할 수 있습니다.
          </li>
        </ul>
      </section>

      <section>
        <h2>제5조 이용 한도</h2>
        <ul>
          <li>
            무료 외부 서비스의 한도를 지키기 위해 회원별로 하루 질문 수를 제한합니다 (기본 20회,
            한국 시간 00:00에 초기화).
          </li>
          <li>서비스 범위를 벗어나 답변하지 않은 질문도 1회로 셉니다.</li>
          <li>서비스 전체 사용량이 한도에 가까우면 새 분석을 일시적으로 받지 않을 수 있습니다.</li>
        </ul>
      </section>

      <section>
        <h2>제6조 이용자가 하면 안 되는 일</h2>
        <ul>
          <li>자동 프로그램으로 질문을 반복해 보내는 행위</li>
          <li>AI의 지시를 바꾸거나 내부 설정을 알아내려는 행위</li>
          <li>서비스 결과를 상업적으로 이용하거나, 출처를 지우고 다시 배포하는 행위</li>
        </ul>
      </section>

      <section>
        <h2>제7조 자료의 출처와 권리</h2>
        <p>
          재무·공시 자료는 DART, 주가 정보는 공공데이터포털 「금융위원회_주식시세정보」(출처:
          한국거래소), 뉴스는 Google 뉴스 RSS로 찾습니다. 뉴스 기사의 저작권은 각 언론사에 있으며,
          서비스는 기사 제목·언론사·날짜·링크와 직접 작성한 짧은 요지만 보여줍니다.
        </p>
      </section>

      <section>
        <h2>제8조 약관 변경</h2>
        <p>
          약관을 바꾸면 시행일과 함께 이 화면에 알립니다. 바뀐 약관에 동의하지 않으면 회원 탈퇴를
          요청할 수 있습니다.
        </p>
      </section>
    </LegalDocument>
  );
}
