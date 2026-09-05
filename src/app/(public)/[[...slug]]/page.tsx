import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  resolvePublicSiteByHost,
  findSite,
  findPublishedPage,
  findBoard,
  findBoardPostsPage,
  findPost,
  type PublicSiteContext,
} from "@/lib/tenant";
import { renderLayout } from "@/blocks/render";
import { BoardList } from "@/components/public/board-list";
import { PostDetail } from "@/components/public/post-detail";

/**
 * Public Renderer.
 *
 * 요청 흐름:
 *   Host 확인 → Site lookup → siteId → 아래 순서로 해석
 *
 *   []        → 홈 (Page slug "")
 *   [a]       → Page "a", 없으면 게시판 목록 a
 *   [a, b]    → Page "a/b", 없으면 게시판 a 의 게시물 b
 *
 * Page 를 먼저 보는 이유: 학교가 만든 페이지가 항상 우선한다.
 * 게시판은 시스템이 제공하는 화면이므로 뒤로 밀린다.
 *
 * draftLayout 은 여기서 절대 읽지 않는다. 편집 중인 내용이 공개 사이트로
 * 새어 나가면 승인 절차 자체가 무의미해진다.
 */

const POSTS_PER_PAGE = 10;

type Resolution =
  | { kind: "page"; page: NonNullable<Awaited<ReturnType<typeof findPublishedPage>>> }
  | { kind: "board"; boardSlug: string; boardName: string }
  | { kind: "post"; boardSlug: string; boardName: string; postId: string };

async function resolvePath(
  ctx: PublicSiteContext,
  segments: string[],
): Promise<Resolution | null> {
  const slug = segments.join("/");

  const page = await findPublishedPage(ctx, slug);
  if (page) return { kind: "page", page };

  if (segments.length === 1) {
    const board = await findBoard(ctx, segments[0]!);
    return board
      ? { kind: "board", boardSlug: board.slug, boardName: board.name }
      : null;
  }

  if (segments.length === 2) {
    const board = await findBoard(ctx, segments[0]!);
    if (!board) return null;
    return {
      kind: "post",
      boardSlug: board.slug,
      boardName: board.name,
      postId: segments[1]!,
    };
  }

  return null;
}

async function requireContext(): Promise<PublicSiteContext> {
  const host = (await headers()).get("host") ?? "";
  const ctx = await resolvePublicSiteByHost(host);
  if (!ctx) notFound();
  return ctx;
}

export async function generateMetadata({
  params,
}: PageProps<"/[[...slug]]">): Promise<Metadata> {
  const host = (await headers()).get("host") ?? "";
  const ctx = await resolvePublicSiteByHost(host);
  if (!ctx) return {};

  const { slug } = await params;
  const [site, resolved] = await Promise.all([
    findSite(ctx),
    resolvePath(ctx, slug ?? []),
  ]);

  if (!resolved) return { title: site.name };

  const title =
    resolved.kind === "page"
      ? resolved.page.slug === ""
        ? null
        : resolved.page.title
      : resolved.boardName;

  return { title: title ? `${title} - ${site.name}` : site.name };
}

export default async function PublicPage({ params }: PageProps<"/[[...slug]]">) {
  const ctx = await requireContext();
  const { slug } = await params;
  const segments = slug ?? [];

  const [site, resolved] = await Promise.all([
    findSite(ctx),
    resolvePath(ctx, segments),
  ]);
  if (!resolved) notFound();

  if (resolved.kind === "board") {
    // 페이지 번호는 searchParams 로 받는 것이 자연스럽지만, 카탈로그 경로가
    // 캐시 단위와 얽히지 않도록 목록 1쪽만 서버에서 그리고 이동은 링크로 처리한다.
    const { posts, total, page, perPage } = await findBoardPostsPage(
      ctx,
      resolved.boardSlug,
      1,
      POSTS_PER_PAGE,
    );

    return (
      <BoardList
        boardSlug={resolved.boardSlug}
        boardName={resolved.boardName}
        posts={posts}
        total={total}
        page={page}
        perPage={perPage}
      />
    );
  }

  if (resolved.kind === "post") {
    const post = await findPost(ctx, resolved.boardSlug, resolved.postId);
    if (!post) notFound();

    return (
      <PostDetail
        boardSlug={resolved.boardSlug}
        boardName={resolved.boardName}
        post={post}
      />
    );
  }

  const { nodes, issues } = await renderLayout({
    layout: resolved.page.publishedLayout,
    ctx,
    site: {
      id: site.id,
      name: site.name,
      slug: site.slug,
      organizationName: site.organization.name,
    },
    mode: "public",
  });

  // 건너뛴 블록은 반드시 남긴다. 조용히 사라지면 학교는 왜 안 보이는지 모른다.
  // TODO: console 이 아니라 AuditLog 에 기록하고 운영 대시보드에 노출한다.
  if (issues.length > 0) {
    console.warn(
      `[renderer] site=${site.slug} page=${resolved.page.slug || "(홈)"} 문제 ${issues.length}건`,
      issues,
    );
  }

  return <>{nodes}</>;
}
