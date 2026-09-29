// 역할 간 공통 계약 타입 — 기준: DevelopDoc/API_SPEC.md §2
// 바꿀 때는 API_SPEC을 먼저 고치고, 데이터/서버 + 기획/화면 모두의 확인을 받는다 (API_SPEC §9).
export type * from "./base";
export type * from "./request";
export type * from "./status";
export type * from "./flow";
export type * from "./result";
export type * from "./explanation";
export type * from "./board";
export type * from "./analysis";
