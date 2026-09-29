import { MOCK_MODE } from "@/lib/api-client/mode";

/** 가짜 모드일 때 모든 화면 맨 위에 붙는 안내. 가짜 숫자를 실제 값으로 오해하지 않게 한다 */
export function MockBanner() {
  if (!MOCK_MODE) return null;
  return (
    <p
      role="status"
      className="bg-notice-bg px-4 py-2 text-center text-sm font-medium text-notice-ink"
    >
      개발용 가짜 데이터로 동작 중입니다. 화면의 숫자는 실제 공시 값이 아닙니다.
    </p>
  );
}
