import type { NextAuthConfig } from "next-auth";

/**
 * 미들웨어에서도 쓸 수 있는 최소 설정.
 *
 * 미들웨어는 DB 에 접근할 수 없는 환경에서 실행될 수 있으므로,
 * Prisma 를 쓰는 Credentials provider 는 여기 두지 않고 src/auth.ts 에서 합친다.
 * (이 파일에 prisma 를 끌어들이면 미들웨어 번들이 깨진다.)
 */
export const authConfig = {
  /**
   * 리버스 프록시 뒤에서 Host 헤더를 신뢰한다.
   *
   * 이것을 켜지 않으면 production 빌드에서 로그인이 UntrustedHost 로 실패한다.
   * 개발 모드에서는 Auth.js 가 자동으로 통과시키기 때문에 드러나지 않고,
   * K-PaaS Ingress 에 올린 뒤에야 "로그인만 안 되는" 형태로 나타난다.
   *
   * 전제 조건이 있다. Host 헤더를 신뢰한다는 것은, 공격자가 Host 를 바꿔
   * 콜백 URL 을 조작할 수 없어야 한다는 뜻이다. 따라서 배포 시:
   *   - Ingress 에 명시적인 host 규칙을 두어 임의 Host 를 거른다.
   *   - 가능하면 AUTH_URL 을 실제 공개 주소로 고정한다.
   */
  trustHost: true,

  // Credentials 로그인은 데이터베이스 세션을 쓸 수 없다.
  session: { strategy: "jwt", maxAge: 60 * 60 * 8 }, // 8시간
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    /**
     * 토큰에는 사용자 식별자만 넣는다.
     *
     * 역할(role)과 소속 조직은 토큰에 담지 않는다. 담으면 관리자가 권한을
     * 회수해도 기존 토큰이 만료될 때까지 예전 권한으로 계속 동작한다.
     * 대신 요청마다 DB 에서 확인한다 (src/lib/session.ts).
     */
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
