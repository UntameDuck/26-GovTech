import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminSession, can } from "@/lib/session";
import { findSite, findAdminPost, TenantBoundaryError } from "@/lib/tenant";
import { formatDate, toDateTimeAttribute } from "@/lib/format";
import { AdminShell } from "@/components/admin/admin-shell";
import { PostForm } from "@/components/admin/post-form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "초안 — 공개 사이트에 보이지 않습니다.",
  PUBLISHED: "공개 중 — 학교 홈페이지에서 볼 수 있습니다.",
  HIDDEN: "숨김 — 공개 사이트에서 내려간 상태입니다.",
};

export default async function EditPostPage({
  params,
}: PageProps<"/admin/boards/[boardSlug]/[postId]">) {
  const { boardSlug, postId } = await params;
  const session = await requireAdminSession();

  const site = await findSite(session);

  let post;
  try {
    post = await findAdminPost(session, postId);
  } catch (error) {
    // 다른 사이트의 글이거나 없는 글이면 존재 자체를 알리지 않는다.
    if (error instanceof TenantBoundaryError) notFound();
    throw error;
  }

  // 주소의 게시판과 글이 실제로 속한 게시판이 다르면 잘못된 링크다.
  if (post.board.slug !== boardSlug) notFound();

  return (
    <AdminShell
      siteName={site.name}
      viewer={{ name: session.name, role: session.role }}
      breadcrumb={[
        { label: "게시판", href: "/admin/boards" },
        { label: post.board.name, href: `/admin/boards/${post.board.slug}` },
        { label: "글 수정" },
      ]}
    >
      <div className="mb-6">
        <h1 className="text-[2.4rem] font-bold text-bolder">글 수정</h1>
        <p className="mt-2 text-[1.4rem] text-subtle">
          {STATUS_LABEL[post.status] ?? post.status}
          {post.publishedAt ? (
            <>
              {" · 발행 "}
              <time dateTime={toDateTimeAttribute(post.publishedAt)}>
                {formatDate(post.publishedAt)}
              </time>
            </>
          ) : null}
        </p>
        {post.status === "PUBLISHED" ? (
          <p className="mt-2 text-[1.3rem]">
            <Link
              href={`/${post.board.slug}/${post.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-brand underline underline-offset-4"
            >
              공개 사이트에서 보기
              <span className="sr-only-krds"> (새 창에서 열림)</span>
            </Link>
          </p>
        ) : null}
      </div>

      <PostForm
        mode={{
          kind: "edit",
          postId: post.id,
          status: post.status,
          canPublish: can(session, "PUBLISH_POST"),
        }}
        initial={{
          title: post.title,
          body: post.body,
          pinned: post.pinned,
        }}
      />
    </AdminShell>
  );
}
