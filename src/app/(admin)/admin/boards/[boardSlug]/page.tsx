import Link from "next/link";
import { requireAdminSession } from "@/lib/session";
import { findSite, findAdminPosts } from "@/lib/tenant";
import { formatDate, toDateTimeAttribute } from "@/lib/format";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

/**
 * 상태 배지.
 *
 * 색만으로 구분하지 않고 글자를 함께 넣는다.
 * 색각 이상이 있는 사용자에게 색은 정보가 되지 못한다 (KWCAG 2.2).
 */
const STATUS: Record<string, { label: string; className: string }> = {
  DRAFT: {
    label: "초안",
    className: "bg-surface-muted text-subtle",
  },
  PUBLISHED: {
    label: "공개",
    className: "bg-surface-primary text-brand",
  },
  HIDDEN: {
    label: "숨김",
    className: "bg-[var(--krds-surface-danger-subtler)] text-danger",
  },
};

export default async function BoardPostsPage({
  params,
}: PageProps<"/admin/boards/[boardSlug]">) {
  const { boardSlug } = await params;
  const session = await requireAdminSession();

  const [site, { board, posts }] = await Promise.all([
    findSite(session),
    findAdminPosts(session, boardSlug),
  ]);

  return (
    <AdminShell
      siteName={site.name}
      viewer={{ name: session.name, role: session.role }}
      breadcrumb={[
        { label: "게시판", href: "/admin/boards" },
        { label: board.name },
      ]}
    >
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[2.4rem] font-bold text-bolder">{board.name}</h1>
          <p className="mt-1 text-[1.4rem] text-subtle">전체 {posts.length}건</p>
        </div>
        <Link
          href={`/admin/boards/${board.slug}/new`}
          className="rounded-krds-sm bg-[var(--krds-action-secondary-active)] px-4 py-3 text-[1.4rem] font-bold text-[var(--krds-text-disabled-on)] no-underline"
        >
          글쓰기
        </Link>
      </div>

      {posts.length === 0 ? (
        <p className="rounded-krds-md border border-line bg-surface px-5 py-12 text-center text-[1.5rem] text-subtle">
          아직 작성된 글이 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--krds-divider-gray-light)] rounded-krds-md border border-line bg-surface">
          {posts.map((post) => {
            const status = STATUS[post.status] ?? STATUS.DRAFT!;
            return (
              <li key={post.id}>
                <Link
                  href={`/admin/boards/${board.slug}/${post.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 no-underline hover:bg-surface-subtle"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span
                      className={`shrink-0 rounded-krds-sm px-2 py-1 text-[1.2rem] font-bold ${status.className}`}
                    >
                      {status.label}
                    </span>
                    {post.pinned ? (
                      <span className="shrink-0 rounded-krds-sm border border-line px-2 py-1 text-[1.2rem] text-subtle">
                        고정
                      </span>
                    ) : null}
                    <span className="truncate text-[1.6rem] text-basic">
                      {post.title}
                    </span>
                  </span>
                  <span className="shrink-0 text-[1.3rem] text-subtle">
                    {post.author?.name ? `${post.author.name} · ` : ""}
                    <time dateTime={toDateTimeAttribute(post.updatedAt)}>
                      {formatDate(post.updatedAt)}
                    </time>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </AdminShell>
  );
}
