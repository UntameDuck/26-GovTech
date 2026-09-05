import Link from "next/link";
import { requireAdminSession } from "@/lib/session";
import { findSite, findAdminBoards } from "@/lib/tenant";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  NOTICE: "공지",
  PARENT_LETTER: "가정통신문",
  GALLERY: "사진",
  SCHEDULE: "일정",
  MEAL: "급식",
};

export default async function BoardsPage() {
  const session = await requireAdminSession();
  const [site, boards] = await Promise.all([
    findSite(session),
    findAdminBoards(session),
  ]);

  return (
    <AdminShell
      siteName={site.name}
      viewer={{ name: session.name, role: session.role }}
      breadcrumb={[{ label: "게시판" }]}
    >
      <h1 className="mb-2 text-[2.4rem] font-bold text-bolder">게시판</h1>
      <p className="mb-6 text-[1.4rem] text-subtle">
        홈페이지의 게시판 블록은 여기에 있는 게시판을 가리킵니다.
      </p>

      {boards.length === 0 ? (
        <p className="rounded-krds-md border border-line bg-surface px-5 py-12 text-center text-[1.5rem] text-subtle">
          게시판이 없습니다.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {boards.map((board) => (
            <li key={board.id}>
              <Link
                href={`/admin/boards/${board.slug}`}
                className="flex items-center justify-between gap-4 rounded-krds-md border border-line bg-surface px-5 py-4 no-underline hover:bg-surface-subtle"
              >
                <span>
                  <span className="block text-[1.6rem] font-bold text-bolder">
                    {board.name}
                  </span>
                  <span className="mt-1 block text-[1.3rem] text-subtle">
                    {KIND_LABEL[board.kind] ?? board.kind} · /{board.slug}
                  </span>
                </span>
                <span className="shrink-0 text-[1.4rem] text-subtle">
                  {board._count.posts}건
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}
