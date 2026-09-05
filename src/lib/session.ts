import "server-only";
import { cache } from "react";
import type { OrgRole } from "@prisma/client";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import type { AdminContext } from "@/lib/tenant";

/**
 * 로그인한 관리자의 컨텍스트와 권한.
 *
 * 인증 도입 전까지 쓰던 개발용 스텁(dev-admin)은 이 파일로 대체하고 삭제했다.
 *
 * 역할을 세션 토큰에 담지 않고 요청마다 DB 에서 확인한다.
 * 담아 두면 관리자가 권한을 회수해도 토큰이 만료될 때까지 예전 권한으로
 * 계속 동작한다. 아키텍처 문서 03 이 "권한 변경"을 감사 대상으로 두는 이상,
 * 변경이 즉시 반영되지 않는 것은 정책과 모순된다.
 */

/**
 * 세부 권한.
 *
 * 앞의 네 개는 아키텍처 문서 02 에 정의된 것이고,
 * EDIT_CONTENT / PUBLISH_PAGE 는 실제 편집·승인 흐름을 나누기 위해 추가했다.
 * 문서 02 도 "권한은 역할 외에도 세부 capability 로 분리할 수 있다"고 적고 있다.
 */
export type Capability =
  | "VIEW_SITE"
  | "VIEW_SCAN"
  | "MANAGE_SITE"
  | "MANAGE_POLICY"
  /** 페이지 초안과 게시물을 수정할 수 있다. 공개 권한은 포함하지 않는다. */
  | "EDIT_CONTENT"
  /** 페이지 구성(홈페이지 레이아웃)을 공개 사이트에 반영할 수 있다. */
  | "PUBLISH_PAGE"
  /**
   * 게시물을 공개할 수 있다.
   *
   * PUBLISH_PAGE 와 나눠 둔 이유: 지금은 같은 역할에 함께 주지만, 두 행위의
   * 무게가 다르다. 공지 하나를 올리는 것은 일상 업무이고 홈페이지 구성을
   * 바꾸는 것은 그렇지 않다. 학교에 따라 "교사는 공지를 바로 올리되 홈 구성은
   * 못 바꾼다"가 자연스러울 수 있어, 나중에 갈라질 수 있도록 미리 분리했다.
   */
  | "PUBLISH_POST";

/**
 * 역할 → 권한 표.
 *
 * deny-by-default 다. 여기 적히지 않은 조합은 전부 거부된다 (문서 03).
 * EDITOR 가 PUBLISH_PAGE 를 갖지 않는 것이 핵심이다.
 * 교사가 초안을 쓰고 승인권자가 공개하는 흐름을 권한으로 보장한다.
 */
const ROLE_CAPABILITIES: Record<OrgRole, ReadonlyArray<Capability>> = {
  OWNER: [
    "VIEW_SITE",
    "VIEW_SCAN",
    "MANAGE_SITE",
    "MANAGE_POLICY",
    "EDIT_CONTENT",
    "PUBLISH_PAGE",
    "PUBLISH_POST",
  ],
  ADMIN: [
    "VIEW_SITE",
    "VIEW_SCAN",
    "MANAGE_SITE",
    "EDIT_CONTENT",
    "PUBLISH_PAGE",
    "PUBLISH_POST",
  ],
  APPROVER: ["VIEW_SITE", "EDIT_CONTENT", "PUBLISH_PAGE", "PUBLISH_POST"],
  EDITOR: ["VIEW_SITE", "EDIT_CONTENT"],
};

export type AdminSession = AdminContext & {
  role: OrgRole;
  email: string;
  name: string;
  capabilities: ReadonlyArray<Capability>;
};

/** 로그인하지 않았거나 소속 조직이 없을 때. */
export class NotAuthenticatedError extends Error {
  constructor() {
    super("로그인이 필요합니다.");
    this.name = "NotAuthenticatedError";
  }
}

/** 로그인은 했지만 권한이 없을 때. */
export class NotAuthorizedError extends Error {
  constructor(capability: Capability) {
    super(`이 작업을 수행할 권한이 없습니다: ${capability}`);
    this.name = "NotAuthorizedError";
  }
}

/**
 * 현재 요청의 관리자 세션.
 *
 * React 의 cache 로 감싸서 한 요청 안에서는 DB 를 한 번만 친다.
 * 페이지와 여러 서버 액션이 각각 호출해도 질의가 늘지 않는다.
 */
export const getAdminSession = cache(async (): Promise<AdminSession | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const membership = await prisma.organizationMembership.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organizationId: true,
      user: { select: { email: true, name: true } },
      organization: {
        select: {
          // 사이트가 여러 개면 지금은 가장 먼저 만든 것을 쓴다.
          // 사이트 선택 화면은 사이트가 실제로 여러 개가 될 때 만든다.
          sites: {
            orderBy: { createdAt: "asc" },
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });

  // 계정은 있으나 어떤 조직에도 속하지 않은 사용자는 관리자가 아니다.
  if (!membership) return null;

  return {
    kind: "admin",
    userId,
    organizationId: membership.organizationId,
    siteId: membership.organization.sites[0]?.id,
    role: membership.role,
    email: membership.user.email,
    name: membership.user.name,
    capabilities: ROLE_CAPABILITIES[membership.role],
  };
});

/** 세션이 없으면 예외. 관리자 화면과 서버 액션의 첫 줄에서 호출한다. */
export async function requireAdminSession(): Promise<AdminSession> {
  const session = await getAdminSession();
  if (!session) throw new NotAuthenticatedError();
  return session;
}

export function can(session: AdminSession, capability: Capability): boolean {
  return session.capabilities.includes(capability);
}

/** 권한이 없으면 예외. 쓰기 동작 앞에서 호출한다. */
export async function requireCapability(
  capability: Capability,
): Promise<AdminSession> {
  const session = await requireAdminSession();
  if (!can(session, capability)) throw new NotAuthorizedError(capability);
  return session;
}
