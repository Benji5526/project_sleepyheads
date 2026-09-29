import { NextResponse } from "next/server";

// API_SPEC §1.4 성공 응답 형식
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function created<T>(data: T) {
  return ok(data, 201);
}

export function list<T>(data: T[], nextCursor: string | null) {
  return NextResponse.json({ data, nextCursor });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}
