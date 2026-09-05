import { z } from "zod";
import { defineBlock, type BlockRenderProps } from "@/blocks/types";
import { findGalleryItems } from "@/lib/tenant";
import { formatDate, toDateTimeAttribute } from "@/lib/format";

/**
 * Gallery — 사진 게시판.
 *
 * 승인(APPROVED)된 이미지 첨부만 노출한다.
 * 검사를 통과하지 않은 파일이 공개 사이트에 뜨는 일이 없도록
 * 필터링은 컴포넌트가 아니라 loader(=DB 질의)에서 처리한다.
 */

const propsSchema = z.object({
  heading: z.string().max(40).default("학교 사진"),
  boardSlug: z.string().min(1).max(60).default("gallery"),
  count: z.number().int().min(2).max(12).default(4),
  columns: z.enum(["2", "3", "4"]).default("4"),
});

type Props = z.infer<typeof propsSchema>;

type GalleryItem = {
  id: string;
  title: string;
  href: string;
  imageUrl: string | null;
  /** 이미지의 대체 텍스트. 게시물 제목을 쓴다. */
  alt: string;
  dateLabel: string;
  dateTime: string;
};

type Data = { items: GalleryItem[]; moreHref: string };

const columnClass: Record<Props["columns"], string> = {
  "2": "grid-cols-1 sm:grid-cols-2",
  "3": "grid-cols-2 md:grid-cols-3",
  "4": "grid-cols-2 md:grid-cols-4",
};

function Gallery({ props, data }: BlockRenderProps<Props, Data>) {
  const headingId = `gallery-${props.boardSlug}-heading`;
  if (data.items.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="bg-surface-subtle">
      <div className="mx-auto w-full max-w-[120rem] px-6 py-12">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id={headingId} className="text-[2.4rem] font-bold text-bolder">
            {props.heading}
          </h2>
          <a
            href={data.moreHref}
            className="text-[1.5rem] text-brand underline underline-offset-4"
          >
            더보기
            <span className="sr-only-krds"> — {props.heading}</span>
          </a>
        </div>

        <ul className={`grid gap-4 ${columnClass[props.columns]}`}>
          {data.items.map((item) => (
            <li key={item.id}>
              <a href={item.href} className="group block no-underline">
                <div className="aspect-[4/3] overflow-hidden rounded-krds-md border border-line bg-surface-muted">
                  {item.imageUrl ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.imageUrl}
                      alt={item.alt}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="flex h-full w-full items-center justify-center text-[1.4rem] text-subtle"
                    >
                      이미지 없음
                    </span>
                  )}
                </div>
                <p className="mt-2 truncate text-[1.5rem] text-basic group-hover:underline">
                  {item.title}
                </p>
                {item.dateLabel ? (
                  <time
                    dateTime={item.dateTime}
                    className="text-[1.3rem] text-subtle"
                  >
                    {item.dateLabel}
                  </time>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export const galleryBlock = defineBlock<Props, Data>({
  type: "gallery",
  label: "사진 게시판",
  description: "사진 게시판의 최근 글을 썸네일 격자로 보여줍니다.",
  category: "콘텐츠",
  schema: propsSchema,
  defaults: {
    heading: "학교 사진",
    boardSlug: "gallery",
    count: 4,
    columns: "4",
  },
  emptyData: { items: [], moreHref: "#" },
  settings: [
    { kind: "text", name: "heading", label: "제목", maxLength: 40 },
    { kind: "board", name: "boardSlug", label: "사진 게시판" },
    { kind: "number", name: "count", label: "표시 개수", min: 2, max: 12 },
    {
      kind: "select",
      name: "columns",
      label: "한 줄에 보일 개수",
      options: [
        { value: "2", label: "2개" },
        { value: "3", label: "3개" },
        { value: "4", label: "4개" },
      ],
    },
  ],
  loader: async ({ props, ctx }) => {
    const posts = await findGalleryItems(ctx, props.boardSlug, props.count);

    return {
      items: posts.map((post) => {
        const image = post.attachments[0];
        return {
          id: post.id,
          title: post.title,
          href: `/${props.boardSlug}/${post.id}`,
          // 실제 파일 서빙 경로. 저장 키를 그대로 노출하지 않고 라우트를 거친다.
          imageUrl: image ? `/api/assets/${image.id}` : null,
          alt: post.title,
          dateLabel: formatDate(post.publishedAt),
          dateTime: toDateTimeAttribute(post.publishedAt),
        };
      }),
      moreHref: `/${props.boardSlug}`,
    };
  },
  Component: Gallery,
});
