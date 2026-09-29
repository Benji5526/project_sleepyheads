import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal/LegalDocument";

export const metadata: Metadata = { title: "개인정보 처리방침" };

export default function PrivacyPage() {
  return (
    <LegalDocument title="개인정보 처리방침" effectiveDate="2026년 9월 28일">
      <section>
        <p>
          sleepyheads(이하 &ldquo;서비스&rdquo;)는 「개인정보 보호법」에 따라 이용자의 개인정보를
          보호하고, 서비스에 꼭 필요한 최소한의 정보만 처리합니다.
        </p>
      </section>

      <section>
        <h2>1. 처리하는 개인정보 항목과 목적</h2>
        <table>
          <thead>
            <tr>
              <th scope="col">구분</th>
              <th scope="col">항목</th>
              <th scope="col">목적</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>회원 정보</td>
              <td>구글 계정 고유 ID, 이름(닉네임), 이메일 주소, 가입일, 약관 동의 일시</td>
              <td>회원 식별, 로그인 유지, 약관 동의 확인</td>
            </tr>
            <tr>
              <td>이용 기록</td>
              <td>입력한 질문, 분석 결과, 날짜별 질문 수</td>
              <td>분석 결과 제공·보관, 하루 이용 한도 적용</td>
            </tr>
          </tbody>
        </table>
        <p>
          비밀번호는 받지 않습니다. 서비스 범위를 벗어나 답변하지 않은 질문은 유형별 건수로만
          집계하며, 질문 원문을 따로 모으지 않습니다.
        </p>
      </section>

      <section>
        <h2>2. 보관 기간</h2>
        <p>회원 탈퇴 시까지 보관하고, 탈퇴하면 지체 없이 파기합니다.</p>
      </section>

      <section>
        <h2>3. 파기 방법</h2>
        <p>
          회원 정보, 질문, 분석 결과, 이용 기록을 데이터베이스에서 복구할 수 없도록 삭제하고, 로그인
          계정 정보도 함께 삭제합니다.
        </p>
      </section>

      <section>
        <h2>4. 처리를 맡기는 곳 (국외 이전 포함)</h2>
        <p>
          서비스 운영을 위해 아래 외부 서비스를 이용하며, 정보가 국외 서버에 저장될 수 있습니다.
        </p>
        <table>
          <thead>
            <tr>
              <th scope="col">업체</th>
              <th scope="col">맡기는 일</th>
              <th scope="col">전달되는 정보</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Supabase</td>
              <td>데이터베이스, 로그인 처리</td>
              <td>회원 정보, 이용 기록</td>
            </tr>
            <tr>
              <td>Vercel</td>
              <td>웹사이트·서버 운영</td>
              <td>접속 기록</td>
            </tr>
            <tr>
              <td>Google</td>
              <td>구글 계정 로그인</td>
              <td>로그인 요청</td>
            </tr>
            <tr>
              <td>OpenAI</td>
              <td>질문 해석, 분석 글 작성</td>
              <td>입력한 질문, 서버가 계산한 결과 (이름·이메일은 보내지 않음)</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h2>5. 이용자의 권리</h2>
        <p>
          이용자는 언제든지 자기 개인정보의 열람·정정·삭제를 요청하거나 회원 탈퇴를 할 수 있습니다.
          질문 입력란에 개인정보를 적지 않도록 주의해 주세요.
        </p>
      </section>

      <section>
        <h2>6. 개인정보 보호 책임자</h2>
        {/* TODO(기획/화면): 책임자 이름과 연락처(팀 공용 이메일 등)를 배포 전에 채운다 */}
        <p>책임자: 졸린이즈 팀 (연락처는 서비스 공개 전에 안내합니다)</p>
      </section>
    </LegalDocument>
  );
}
