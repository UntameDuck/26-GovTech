import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { BlockDataSource } from "@/blocks/types";

/**
 * 테넌트 경계.
 *
 * 아키텍처 문서 03 의 규칙:
 *   findPage(pageId)                          → 금지
 *   findPage(pageId, organizationId, siteId)  → 허용
 *
 * 이 파일은 그 규칙을 "지키자"는 약속이 아니라 타입으로 강제하는 것이 목적이다.
 * tenant-scoped 데이터를 읽는 코드는 반드시 TenantContext 를 먼저 얻어야 하고,
 * 컨텍스트 없이 prisma 를 직접 부르는 코드는 리뷰에서 걸러낸다.
 *
 * 관련 ESLint 규칙은 추후 no-restricted-imports 로 추가한다
 * (src/lib/db.ts 는 src/lib/tenant.ts 와 src/lib/auth 밖에서 import 금지).
 */

/** 공개 사이트 요청. 사이트 하나에만 접근할 수 있고 published 데이터만 본다. */
export type PublicSiteContext = {
  kind: "public";
  siteId: string;
  organizationId: string;
};

/** 로그인한 관리자 요청. 자신이 속한 조직 범위 안에서만 움직인다. */
export type AdminContext = {
  kind: "admin";
  userId: string;
  organizationId: string;
  siteId?: string;
};

export type TenantContext = PublicSiteContext | AdminContext;

/** 테넌트 경계를 벗어난 접근. 404 로 응답해 자원의 존재 자체를 숨긴다. */
export class TenantBoundaryError extends Error {
  constructor(resource: string) {
    super(`테넌트 경계 밖의 자원에 접근했습니다: ${resource}`);
    this.name = "TenantBoundaryError";
  }
}

// ---------------------------------------------------------------- 컨텍스트 생성

/**
 * Host 헤더로 공개 사이트를 찾는다.
 *
 * 학교마다 애플리케이션을 배포하지 않고 하나의 Renderer 가 여러 사이트를
 * 처리하기 때문에, 요청을 어느 테넌트로 볼지 결정하는 유일한 지점이다.
 */
export async function resolvePublicSiteByHost(
  host: string,
): Promise<PublicSiteContext | null> {
  // 포트를 떼고 소문자로 맞춘다. "school-a.localhost:3000" → "school-a.localhost"
  const domain = host.split(":")[0]!.toLowerCase();

  const site = await prisma.site.findFirst({
    where: { domain, published: true },
    select: { id: true, organizationId: true },
  });

  if (site) {
    return {
      kind: "public",
      siteId: site.id,
      organizationId: site.organizationId,
    };
  }

  // 로컬 개발 편의: 도메인이 안 붙은 사이트를 slug 로 찾는다.
  // 운영에서는 DEFAULT_SITE_SLUG 를 비워 두어 이 경로를 끈다.
  const fallbackSlug = process.env.DEFAULT_SITE_SLUG;
  if (!fallbackSlug) return null;

  const fallback = await prisma.site.findFirst({
    where: { slug: fallbackSlug, published: true },
    select: { id: true, organizationId: true },
  });

  return fallback
    ? {
        kind: "public",
        siteId: fallback.id,
        organizationId: fallback.organizationId,
      }
    : null;
}

// ---------------------------------------------------------------- 조회 헬퍼
//
// 아래 함수들은 전부 TenantContext 를 첫 인자로 받는다.
// where 절에 siteId 를 넣는 것을 호출부의 기억력에 맡기지 않기 위한 것이다.

/** 공개 사이트의 페이지를 slug 로 찾는다. publishedLayout 이 없으면 없는 것으로 본다. */
export async function findPublishedPage(ctx: PublicSiteContext, slug: string) {
  const page = await prisma.page.findFirst({
    where: {
      siteId: ctx.siteId,
      slug,
      status: "PUBLISHED",
      // 아직 한 번도 Publish 되지 않은 페이지는 공개 사이트에서 없는 것으로 본다.
      NOT: { publishedLayout: { equals: Prisma.DbNull } },
    },
    select: {
      id: true,
      slug: true,
      title: true,
      publishedLayout: true,
      publishedAt: true,
    },
  });

  return page;
}

/** 관리자 콘솔에서 편집 중인 페이지를 찾는다. */
export async function findEditablePage(ctx: AdminContext, pageId: string) {
  const page = await prisma.page.findFirst({
    where: {
      id: pageId,
      site: {
        organizationId: ctx.organizationId,
        ...(ctx.siteId ? { id: ctx.siteId } : {}),
      },
    },
    select: {
      id: true,
      siteId: true,
      slug: true,
      title: true,
      status: true,
      draftLayout: true,
      publishedLayout: true,
      updatedAt: true,
    },
  });

  if (!page) throw new TenantBoundaryError(`Page:${pageId}`);
  return page;
}

/** 사이트 정보. 공개 렌더러와 관리자 양쪽에서 쓴다. */
export async function findSite(ctx: TenantContext) {
  const siteId = ctx.kind === "public" ? ctx.siteId : ctx.siteId;
  if (!siteId) throw new TenantBoundaryError("Site:(미지정)");

  const site = await prisma.site.findFirst({
    where: { id: siteId, organizationId: ctx.organizationId },
    select: {
      id: true,
      slug: true,
      name: true,
      domain: true,
      settings: true,
      published: true,
      organization: { select: { id: true, name: true, kind: true } },
    },
  });

  if (!site) throw new TenantBoundaryError(`Site:${siteId}`);
  return site;
}

/**
 * 게시물을 어느 시간 구간에서 가져올지.
 *
 * 이 구분이 필요한 이유:
 *  - 공지사항은 "이미 발행된 것"만 보여야 한다. publishedAt 이 미래인 글은
 *    예약 발행이므로 공개 사이트에 새어 나가면 안 된다.
 *  - 학사일정은 반대로 "앞으로 올 것"을 가까운 순서로 보여야 한다.
 *  - 급식은 오늘까지를 최신순으로 보여준다.
 */
export type PostWindow =
  /** publishedAt <= 지금. 최신순. 공지/가정통신문/사진 게시판용. */
  | "released"
  /** publishedAt >= 오늘 0시. 가까운 순. 학사일정용. */
  | "upcoming"
  /** publishedAt <= 오늘 24시. 최신순. 급식용. */
  | "throughToday";

function startOfToday(): Date {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfToday(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

/**
 * 게시판의 공개 게시물을 가져온다.
 * NoticeBoard / Calendar / Meal 블록의 loader 가 사용한다.
 */
export async function findBoardPosts(
  ctx: TenantContext,
  boardSlug: string,
  limit: number,
  window: PostWindow = "released",
) {
  const siteId = ctx.siteId;
  if (!siteId) throw new TenantBoundaryError("Board:(사이트 미지정)");

  const dateFilter =
    window === "upcoming"
      ? { gte: startOfToday() }
      : window === "throughToday"
        ? { lte: endOfToday() }
        : { lte: new Date() };

  // 다가오는 일정은 가까운 것부터, 나머지는 최신 것부터.
  // 고정(pinned)은 시간 순서를 뒤집는 개념이라 일정 목록에서는 쓰지 않는다.
  const orderBy =
    window === "upcoming"
      ? [{ publishedAt: "asc" as const }]
      : [{ pinned: "desc" as const }, { publishedAt: "desc" as const }];

  return prisma.post.findMany({
    where: {
      siteId,
      status: "PUBLISHED",
      publishedAt: dateFilter,
      board: { siteId, slug: boardSlug },
    },
    orderBy,
    take: Math.min(Math.max(limit, 1), 50),
    select: {
      id: true,
      title: true,
      pinned: true,
      publishedAt: true,
      board: { select: { slug: true, name: true } },
    },
  });
}

/** 게시판 자체. 목록 페이지의 제목과 존재 확인에 쓴다. */
export async function findBoard(ctx: TenantContext, boardSlug: string) {
  const siteId = ctx.siteId;
  if (!siteId) throw new TenantBoundaryError("Board:(사이트 미지정)");

  return prisma.board.findFirst({
    where: { siteId, slug: boardSlug },
    select: { id: true, slug: true, name: true, kind: true },
  });
}

/** 게시판 목록 페이지. 페이지 번호는 1부터. */
export async function findBoardPostsPage(
  ctx: TenantContext,
  boardSlug: string,
  page: number,
  perPage: number,
) {
  const siteId = ctx.siteId;
  if (!siteId) throw new TenantBoundaryError("Board:(사이트 미지정)");

  const where = {
    siteId,
    status: "PUBLISHED" as const,
    publishedAt: { lte: new Date() },
    board: { siteId, slug: boardSlug },
  };

  const [total, posts] = await Promise.all([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
      skip: (Math.max(page, 1) - 1) * perPage,
      take: perPage,
      select: { id: true, title: true, pinned: true, publishedAt: true },
    }),
  ]);

  return { total, posts, page: Math.max(page, 1), perPage };
}

/** 게시물 상세. 게시판 slug 까지 함께 확인해 다른 게시판의 글이 열리지 않게 한다. */
export async function findPost(
  ctx: TenantContext,
  boardSlug: string,
  postId: string,
) {
  const siteId = ctx.siteId;
  if (!siteId) throw new TenantBoundaryError("Post:(사이트 미지정)");

  return prisma.post.findFirst({
    where: {
      id: postId,
      siteId,
      status: "PUBLISHED",
      publishedAt: { lte: new Date() },
      board: { siteId, slug: boardSlug },
    },
    select: {
      id: true,
      title: true,
      body: true,
      publishedAt: true,
      board: { select: { slug: true, name: true } },
      attachments: {
        where: { scanStatus: "APPROVED" },
        select: { id: true, filename: true, byteSize: true, mimeType: true },
      },
    },
  });
}

/**
 * 사진 게시판용. 게시물마다 승인된 이미지 첨부 1장을 함께 가져온다.
 * 스캔을 통과하지 않은(APPROVED 가 아닌) 첨부는 공개 사이트에 절대 노출하지 않는다.
 */
export async function findGalleryItems(
  ctx: TenantContext,
  boardSlug: string,
  limit: number,
) {
  const siteId = ctx.siteId;
  if (!siteId) throw new TenantBoundaryError("Board:(사이트 미지정)");

  return prisma.post.findMany({
    where: {
      siteId,
      status: "PUBLISHED",
      publishedAt: { lte: new Date() },
      board: { siteId, slug: boardSlug },
    },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
    take: Math.min(Math.max(limit, 1), 24),
    select: {
      id: true,
      title: true,
      publishedAt: true,
      attachments: {
        where: { scanStatus: "APPROVED", mimeType: { startsWith: "image/" } },
        orderBy: { createdAt: "asc" },
        take: 1,
        select: { id: true, storageKey: true, filename: true },
      },
    },
  });
}

// ---------------------------------------------------------------- 블록 데이터 접근

/**
 * 블록 loader 에 넘길 데이터 접근 객체를 만든다.
 *
 * 테넌트 컨텍스트를 여기서 닫아 버리기 때문에, 블록은 siteId 를 알 수 없고
 * 다른 학교의 데이터를 요청할 방법 자체가 없다.
 * 블록이 서버 모듈을 import 하지 않게 하려는 목적도 함께 달성한다.
 */
export function createBlockDataSource(ctx: TenantContext): BlockDataSource {
  return {
    async boardPosts(boardSlug, limit, window = "released") {
      const posts = await findBoardPosts(ctx, boardSlug, limit, window);
      return posts.map((post) => ({
        id: post.id,
        title: post.title,
        pinned: post.pinned,
        publishedAt: post.publishedAt,
      }));
    },

    async galleryItems(boardSlug, limit) {
      const posts = await findGalleryItems(ctx, boardSlug, limit);
      return posts.map((post) => {
        const image = post.attachments[0];
        return {
          id: post.id,
          title: post.title,
          publishedAt: post.publishedAt,
          image: image ? { id: image.id, filename: image.filename } : null,
        };
      });
    },
  };
}
