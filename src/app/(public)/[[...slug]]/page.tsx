import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolvePublicSiteByHost, findSite, findPublishedPage } from "@/lib/tenant";
import { renderLayout } from "@/blocks/render";

/**
 * Public Renderer.
 *
 * 요청 흐름:
 *   Host 확인 → Site lookup → siteId → Page(siteId + slug)
 *   → publishedLayout → Block Renderer
 *
 * draftLayout 은 여기서 절대 읽지 않는다. 편집 중인 내용이 공개 사이트에
 * 새어 나가면 승인 절차 자체가 무의미해진다.
 */

async function resolveRequest(slugSegments: string[] | undefined) {
  const host = (await headers()).get("host") ?? "";
  const ctx = await resolvePublicSiteByHost(host);
  if (!ctx) notFound();

  // /notice/123 → "notice/123", / → ""
  const slug = (slugSegments ?? []).join("/");
  const page = await findPublishedPage(ctx, slug);
  if (!page) notFound();

  return { ctx, page };
}

export async function generateMetadata({
  params,
}: PageProps<"/[[...slug]]">): Promise<Metadata> {
  const { slug } = await params;
  const host = (await headers()).get("host") ?? "";
  const ctx = await resolvePublicSiteByHost(host);
  if (!ctx) return {};

  const [site, page] = await Promise.all([
    findSite(ctx),
    findPublishedPage(ctx, (slug ?? []).join("/")),
  ]);

  if (!page) return { title: site.name };

  // 홈은 학교 이름만, 하위 페이지는 "페이지 - 학교" 형태.
  return {
    title: page.slug === "" ? site.name : `${page.title} - ${site.name}`,
  };
}

export default async function PublicPage({ params }: PageProps<"/[[...slug]]">) {
  const { slug } = await params;
  const { ctx, page } = await resolveRequest(slug);
  const site = await findSite(ctx);

  const { nodes, issues } = await renderLayout({
    layout: page.publishedLayout,
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
      `[renderer] site=${site.slug} page=${page.slug || "(홈)"} 문제 ${issues.length}건`,
      issues,
    );
  }

  return <>{nodes}</>;
}
