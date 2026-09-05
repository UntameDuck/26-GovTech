import { requireAdminSession } from "@/lib/session";
import { findSite, requireBoard } from "@/lib/tenant";
import { AdminShell } from "@/components/admin/admin-shell";
import { PostForm } from "@/components/admin/post-form";

export const dynamic = "force-dynamic";

export default async function NewPostPage({
  params,
}: PageProps<"/admin/boards/[boardSlug]/new">) {
  const { boardSlug } = await params;
  const session = await requireAdminSession();

  const [site, board] = await Promise.all([
    findSite(session),
    requireBoard(session, boardSlug),
  ]);

  return (
    <AdminShell
      siteName={site.name}
      viewer={{ name: session.name, role: session.role }}
      breadcrumb={[
        { label: "게시판", href: "/admin/boards" },
        { label: board.name, href: `/admin/boards/${board.slug}` },
        { label: "새 글" },
      ]}
    >
      <h1 className="mb-2 text-[2.4rem] font-bold text-bolder">새 글</h1>
      <p className="mb-6 text-[1.4rem] text-subtle">
        새 글은 초안으로 저장됩니다. 저장한 뒤 공개할 수 있습니다.
      </p>

      <PostForm
        mode={{ kind: "create", boardSlug: board.slug }}
        initial={{ title: "", body: "", pinned: false }}
      />
    </AdminShell>
  );
}
