import Link from "next/link";
import { formatDate, toDateTimeAttribute } from "@/lib/format";

/**
 * 게시물 상세.
 *
 * 본문은 임의 HTML 이 아니라 일반 텍스트로 다룬다.
 * dangerouslySetInnerHTML 을 쓰지 않는 것이 이 화면의 가장 중요한 성질이다.
 * 게시물 본문은 학교 사용자가 넣는 값이고, 마이그레이션으로 들어온 과거
 * 게시물까지 섞이므로, 여기서 HTML 을 허용하면 저장형 XSS 통로가 된다.
 *
 * 서식이 필요해지면 임의 HTML 을 여는 것이 아니라
 * 제한된 마크업(굵게/목록/링크)만 파싱하는 렌더러를 따로 만든다.
 */

export type PostDetailProps = {
  boardSlug: string;
  boardName: string;
  post: {
    id: string;
    title: string;
    body: string;
    publishedAt: Date | null;
    attachments: Array<{
      id: string;
      filename: string;
      byteSize: number;
      mimeType: string;
    }>;
  };
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PostDetail({ boardSlug, boardName, post }: PostDetailProps) {
  return (
    <article className="mx-auto w-full max-w-[100rem] px-6 py-12">
      <nav aria-label="현재 위치" className="mb-4 text-[1.4rem] text-subtle">
        <Link href="/" className="text-subtle no-underline hover:underline">
          홈
        </Link>
        <span aria-hidden="true"> › </span>
        <Link
          href={`/${boardSlug}`}
          className="text-subtle no-underline hover:underline"
        >
          {boardName}
        </Link>
      </nav>

      <header className="border-b-2 border-line-strong pb-5">
        <h1 className="text-[2.8rem] leading-snug font-bold text-bolder">
          {post.title}
        </h1>
        {post.publishedAt ? (
          <time
            dateTime={toDateTimeAttribute(post.publishedAt)}
            className="mt-3 block text-[1.4rem] text-subtle"
          >
            {formatDate(post.publishedAt)}
          </time>
        ) : null}
      </header>

      {/* whitespace-pre-line 으로 줄바꿈만 살린다. HTML 은 해석하지 않는다. */}
      <div className="min-h-[16rem] py-8 text-[1.6rem] leading-relaxed whitespace-pre-line text-basic">
        {post.body.trim() || "내용이 없습니다."}
      </div>

      {post.attachments.length > 0 ? (
        <section
          aria-labelledby="attachments-heading"
          className="rounded-krds-md border border-line bg-surface-subtle px-5 py-4"
        >
          <h2
            id="attachments-heading"
            className="mb-3 text-[1.6rem] font-bold text-bolder"
          >
            첨부파일 {post.attachments.length}개
          </h2>
          <ul className="flex flex-col gap-2">
            {post.attachments.map((file) => (
              <li key={file.id}>
                <a
                  href={`/api/assets/${file.id}`}
                  download={file.filename}
                  className="text-[1.5rem] text-brand underline underline-offset-4"
                >
                  {file.filename}
                  <span className="ml-2 text-subtle no-underline">
                    ({formatBytes(file.byteSize)})
                  </span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-8 border-t border-line pt-6">
        <Link
          href={`/${boardSlug}`}
          className="inline-block rounded-krds-sm border border-line px-5 py-3 text-[1.5rem] text-basic no-underline hover:bg-surface-subtle"
        >
          목록으로
        </Link>
      </div>
    </article>
  );
}
