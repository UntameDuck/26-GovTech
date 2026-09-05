import { z } from "zod";
import { defineBlock, type BlockRenderProps } from "@/blocks/types";
import { formatDate, toDateTimeAttribute } from "@/lib/format";

/**
 * NoticeBoard — 게시판 목록.
 *
 * 표현과 콘텐츠를 분리한다는 원칙이 가장 잘 드러나는 블록이다.
 * 이 블록은 게시물을 소유하지 않는다. 어떤 게시판을 몇 개까지 보여줄지 같은
 * "표시 설정"만 갖고 있고, 실제 글은 Board / Post 가 갖는다.
 *
 * 데이터는 loader 가 가져오고 컴포넌트는 받은 것만 그린다.
 * 덕분에 공개 사이트와 빌더 미리보기가 같은 함수를 통해 같은 데이터를 본다.
 */

const propsSchema = z.object({
  heading: z.string().max(40).default("공지사항"),
  /** Board.slug */
  boardSlug: z.string().min(1).max(60).default("notice"),
  count: z.number().int().min(1).max(20).default(5),
  showDate: z.boolean().default(true),
  /** 목록 하단의 "더보기" 링크 노출 여부 */
  showMoreLink: z.boolean().default(true),
});

type Props = z.infer<typeof propsSchema>;

type NoticeItem = {
  id: string;
  title: string;
  pinned: boolean;
  href: string;
  dateLabel: string;
  dateTime: string;
};

type Data = {
  items: NoticeItem[];
  moreHref: string;
};

function NoticeBoard({ props, data }: BlockRenderProps<Props, Data>) {
  const headingId = `notice-${props.boardSlug}-heading`;

  return (
    <section aria-labelledby={headingId} className="bg-surface">
      <div className="mx-auto w-full max-w-[120rem] px-6 py-12">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id={headingId} className="text-[2.4rem] font-bold text-bolder">
            {props.heading}
          </h2>
          {props.showMoreLink && data.items.length > 0 ? (
            <a
              href={data.moreHref}
              className="text-[1.5rem] text-brand underline underline-offset-4"
            >
              더보기
              <span className="sr-only-krds"> — {props.heading}</span>
            </a>
          ) : null}
        </div>

        {data.items.length === 0 ? (
          <p className="rounded-krds-md border border-line bg-surface-subtle px-5 py-8 text-center text-[1.5rem] text-subtle">
            등록된 게시물이 없습니다.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--krds-divider-gray-light)] border-t border-line">
            {data.items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  className="flex items-center justify-between gap-4 px-1 py-4 no-underline hover:bg-surface-subtle"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    {item.pinned ? (
                      <span className="shrink-0 rounded-krds-sm bg-surface-primary px-2 py-1 text-[1.2rem] font-bold text-brand">
                        고정
                      </span>
                    ) : null}
                    <span className="truncate text-[1.6rem] text-basic">
                      {item.title}
                    </span>
                  </span>
                  {props.showDate && item.dateLabel ? (
                    <time
                      dateTime={item.dateTime}
                      className="shrink-0 text-[1.4rem] text-subtle"
                    >
                      {item.dateLabel}
                    </time>
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export const noticeBoardBlock = defineBlock<Props, Data>({
  type: "noticeBoard",
  label: "게시판 목록",
  description: "공지사항, 가정통신문 등 게시판의 최근 글을 목록으로 보여줍니다.",
  category: "콘텐츠",
  schema: propsSchema,
  defaults: {
    heading: "공지사항",
    boardSlug: "notice",
    count: 5,
    showDate: true,
    showMoreLink: true,
  },
  emptyData: { items: [], moreHref: "#" },
  settings: [
    { kind: "text", name: "heading", label: "제목", maxLength: 40 },
    {
      kind: "board",
      name: "boardSlug",
      label: "게시판",
      help: "보여줄 게시판을 고릅니다. 글은 게시판 관리에서 작성합니다.",
    },
    { kind: "number", name: "count", label: "표시 개수", min: 1, max: 20 },
    { kind: "boolean", name: "showDate", label: "작성일 표시" },
    { kind: "boolean", name: "showMoreLink", label: "더보기 링크 표시" },
  ],
  loader: async ({ props, source }) => {
    const posts = await source.boardPosts(props.boardSlug, props.count);

    return {
      items: posts.map((post) => ({
        id: post.id,
        title: post.title,
        pinned: post.pinned,
        href: `/${props.boardSlug}/${post.id}`,
        dateLabel: formatDate(post.publishedAt),
        dateTime: toDateTimeAttribute(post.publishedAt),
      })),
      moreHref: `/${props.boardSlug}`,
    };
  },
  Component: NoticeBoard,
});
