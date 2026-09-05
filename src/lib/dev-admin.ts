import "server-only";
import { prisma } from "@/lib/db";
import type { AdminContext } from "@/lib/tenant";

/**
 * 개발 전용 관리자 컨텍스트.
 *
 * ⚠️ 이것은 인증이 아니다. 로그인 없이 첫 번째 학교의 관리자인 척한다.
 *
 * Auth.js 연결 전까지 빌더를 만들기 위한 임시 장치이며,
 * 아래 두 가지로 사고를 막는다.
 *
 *   1. production 빌드에서는 호출 즉시 예외를 던진다.
 *   2. 파일 이름과 함수 이름에 dev 를 박아 두어, 실제 인증이 들어올 때
 *      이 함수를 참조하는 곳을 grep 한 번으로 전부 찾을 수 있게 한다.
 *
 * 인증을 붙일 때 이 파일은 삭제한다. 남겨 두고 "나중에 지우자"로 가면
 * 그대로 배포된다.
 */
export async function getDevAdminContext(): Promise<AdminContext> {
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "getDevAdminContext 는 개발 전용입니다. 인증(Auth.js)을 연결하세요.",
    );
  }

  const site = await prisma.site.findFirst({
    orderBy: { createdAt: "asc" },
    select: { id: true, organizationId: true },
  });

  if (!site) {
    throw new Error(
      "사이트가 없습니다. `npm run db:seed` 로 시드 데이터를 만드세요.",
    );
  }

  return {
    kind: "admin",
    userId: "dev-user",
    organizationId: site.organizationId,
    siteId: site.id,
  };
}
