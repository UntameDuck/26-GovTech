import Link from "next/link";
import { formatDate, toDateTimeAttribute } from "@/lib/format";

/**
 * 게시판 목록 페이지.
 *
 * 이 화면은 블록으로 만들지 않는다.
 * 목록/페이지 이동/빈 상태 같은 것은 학교마다 다르게 만들 이유가 없고,
 * 오히려 통일되어 있어야 접근성과 사용성을 플랫폼이 보장할 수 있다.
 * 학교가 자유롭게 구성하는 것은 "페이지"이고, 게시판은 시스템 화면이다.
 */

export type BoardListProps = {
  boardSlug: string;
  boardName: string;
  posts: Array<{
    id: string;
    title: string;
    pinned: boolean;
    publishedAt: Date | null;
  }>;
  total: number;
  page: number;
  perPage: number;
};

export function BoardList({
  boardSlug,
  boardName,
  posts,
  total,
  page,
  perPage,
}: BoardListProps) {
  const lastPage = Math.max(Math.ceil(total / perPage), 1);

  return (
    <div className="mx-auto w-full max-w-[100rem] px-6 py-12">
      <nav aria-label="현재 위치" className="mb-4 text-[1.4rem] text-subtle">
        <Link href="/" className="text-subtle no-underline hover:underline">
          홈
        </Link>
        <span aria-hidden="true"> › </span>
        <span aria-current="page">{boardName}</span>
      </nav>

      <h1 className="mb-2 text-[3rem] font-bold text-bolder">{boardName}</h1>
      <p className="mb-6 text-[1.4rem] text-subtle">
        전체 {total}건 · {page}/{lastPage} 쪽
      </p>

      {posts.length === 0 ? (
        <p className="rounded-krds-md border border-line bg-surface-subtle px-5 py-12 text-center text-[1.5rem] text-subtle">
          등록된 게시물이 없습니다.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--krds-divider-gray-light)] border-t-2 border-line-strong">
          {posts.map((post) => (
            <li key={post.id}>
              <Link
                href={`/${boardSlug}/${post.id}`}
                className="flex items-center justify-between gap-4 px-1 py-5 no-underline hover:bg-surface-subtle"
              >
                <span className="flex min-w-0 items-center gap-2">
                  {post.pinned ? (
                    <span className="shrink-0 rounded-krds-sm bg-surface-primary px-2 py-1 text-[1.2rem] font-bold text-brand">
                      고정
                    </span>
                  ) : null}
                  <span className="truncate text-[1.6rem] text-basic">
                    {post.title}
                  </span>
                </span>
                <time
                  dateTime={toDateTimeAttribute(post.publishedAt)}
                  className="shrink-0 text-[1.4rem] text-subtle"
                >
                  {formatDate(post.publishedAt)}
                </time>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {lastPage > 1 ? (
        <nav aria-label="페이지 이동" className="mt-8 flex justify-center gap-2">
          {Array.from({ length: lastPage }, (_, index) => index + 1).map(
            (number) => (
              <Link
                key={number}
                href={number === 1 ? `/${boardSlug}` : `/${boardSlug}?page=${number}`}
                aria-current={number === page ? "page" : undefined}
                className={[
                  "min-w-[3.6rem] rounded-krds-sm border px-3 py-2 text-center text-[1.5rem] no-underline",
                  number === page
                    ? "border-line-brand bg-surface-primary font-bold text-brand"
                    : "border-line text-basic hover:bg-surface-subtle",
                ].join(" ")}
              >
                {number}
                {number === page ? (
                  <span className="sr-only-krds"> (현재 쪽)</span>
                ) : null}
              </Link>
            ),
          )}
        </nav>
      ) : null}
    </div>
  );
}
