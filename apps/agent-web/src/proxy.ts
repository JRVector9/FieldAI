import { NextResponse, type NextRequest } from "next/server";

// 설계 시안(/preview)은 고정 예시 데이터라 live에서 404로 막는다. mock·sandbox는 기존처럼 허용한다.
export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (process.env.APP_PROFILE === "live" && (path === "/preview" || path.startsWith("/preview/")))
    return new Response("Not Found", { status: 404 });
  return NextResponse.next();
}

export const config = { matcher: ["/preview", "/preview/:path*"] };
