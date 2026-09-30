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

// Response.redirect()나 fetch() 응답은 헤더를 바꿀 수 없으므로 그때는 복사본에 붙인다.
export function withHeader(response: Response, name: string, value: string): Response {
  try {
    response.headers.set(name, value);
    return response;
  } catch {
    const copy = new Response(response.body, response);
    copy.headers.set(name, value);
    return copy;
  }
}
