import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireAdminSession, can } from "@/lib/session";
import { findSite } from "@/lib/tenant";
import { pageLayoutSchema } from "@/lib/page-json";
import { Builder } from "@/components/builder/builder";

/**
 * 관리자 빌더 진입점.
 *
 * 지금은 사이트의 홈페이지를 바로 연다. 사이트/페이지 목록 화면은
 * 인증이 붙은 뒤에 만든다. 그 전에 목록부터 만들면 권한 없이 접근 가능한
 * 관리 화면이 늘어나기만 한다.
 */

// 편집 화면은 항상 최신 상태여야 하므로 캐시하지 않는다.
export const dynamic = "force-dynamic";

export default async function AdminBuilderPage() {
  const ctx = await requireAdminSession();
  const site = await findSite(ctx);

  const page = await prisma.page.findFirst({
    where: { siteId: site.id, slug: "" },
    select: { id: true, title: true, draftLayout: true },
  });
  if (!page) notFound();

  const boards = await prisma.board.findMany({
    where: { siteId: site.id },
    orderBy: { createdAt: "asc" },
    select: { slug: true, name: true },
  });

  // DB 의 draftLayout 은 Json 타입이라 구조를 신뢰할 수 없다.
  // 클라이언트로 넘기기 전에 형태만 확인한다. props 검증은 빌더/저장 시점에 한다.
  const parsed = pageLayoutSchema.safeParse(page.draftLayout);

  return (
    <Builder
      pageId={page.id}
      pageTitle={page.title}
      initialLayout={parsed.success ? parsed.data : []}
      site={{
        id: site.id,
        name: site.name,
        slug: site.slug,
        organizationName: site.organization.name,
      }}
      boards={boards}
      viewer={{ name: ctx.name, role: ctx.role }}
      canPublish={can(ctx, "PUBLISH_PAGE")}
    />
  );
}
