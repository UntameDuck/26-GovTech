import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "@/auth.config";

/**
 * 두 가지를 한다.
 *
 *  1. /admin 이하 접근 제어
 *  2. 보안 헤더 부착 (아키텍처 문서 03 의 "CSP 및 Security Headers")
 *
 * 접근 제어에 대한 주의:
 *   여기서는 세션 쿠키의 유무만 본다. 실제 권한 확인은 서버 컴포넌트와
 *   서버 액션에서 DB 를 보고 한다(src/lib/session.ts).
 *   미들웨어만 믿으면 서버 액션을 직접 호출하는 요청을 막지 못한다.
 */

const { auth } = NextAuth(authConfig);

const isProduction = process.env.NODE_ENV === "production";

/**
 * 요청마다 nonce 를 만들어 script-src 에 넣는다.
 * Next.js 는 CSP 헤더의 nonce 를 읽어 자기 스크립트 태그에 붙인다.
 */
function buildCsp(nonce: string): string {
  const directives = [
    "default-src 'self'",
    // 학교가 임의 스크립트를 넣을 수 없다는 원칙을 브라우저 수준에서 한 번 더 강제한다.
    // 개발 모드는 Turbopack 의 HMR 때문에 eval 이 필요하다.
    isProduction
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' 'unsafe-inline'`,
    // Tailwind 가 만드는 인라인 스타일 때문에 style-src 는 unsafe-inline 이 필요하다.
    // 스타일은 스크립트와 달리 실행되지 않으므로 위험도가 다르다.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    // 외부로 데이터를 보내는 경로를 열지 않는다.
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // 학교 홈페이지가 다른 사이트의 iframe 안에 실릴 이유가 없다. 클릭재킹 방지.
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];
  return directives.join("; ");
}

function applySecurityHeaders(response: NextResponse, nonce: string) {
  response.headers.set("Content-Security-Policy", buildCsp(nonce));
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  // 학교 홈페이지에 필요 없는 브라우저 기능은 아예 꺼 둔다.
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  // HSTS 는 HTTPS 로 서비스할 때만 의미가 있다. 개발(HTTP)에서는 붙이지 않는다.
  if (isProduction) {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=31536000; includeSubDomains",
    );
  }
  return response;
}

function withNonce(request: NextRequest, nonce: string) {
  // Next.js 가 렌더링 중에 nonce 를 읽을 수 있도록 요청 헤더에 실어 보낸다.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  return NextResponse.next({ request: { headers: requestHeaders } });
}

export default auth((req) => {
  const nonce = crypto.randomUUID().replace(/-/g, "");

  if (req.nextUrl.pathname.startsWith("/admin") && !req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    loginUrl.searchParams.set("next", req.nextUrl.pathname);
    return applySecurityHeaders(NextResponse.redirect(loginUrl), nonce);
  }

  return applySecurityHeaders(withNonce(req, nonce), nonce);
});

export const config = {
  // 정적 자산과 인증 API 자체는 건너뛴다.
  matcher: ["/((?!api/auth|_next/static|_next/image|fonts|favicon.ico).*)"],
};
