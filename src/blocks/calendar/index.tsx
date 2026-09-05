import { z } from "zod";
import { defineBlock, type BlockRenderProps } from "@/blocks/types";
import { findBoardPosts } from "@/lib/tenant";
import { formatMonthDay, formatWeekday, toDateTimeAttribute } from "@/lib/format";

/**
 * Calendar — 학사일정.
 *
 * MVP 범위에 대한 솔직한 메모:
 *   지금은 전용 Schedule 모델 없이 "학사일정 게시판"의 게시물을 날짜순으로 읽는다.
 *   즉 반복 일정, 기간 일정(3일짜리 시험), 월 단위 달력 뷰는 아직 없다.
 *   학교에 실제로 필요한 것은 월 달력이므로, Schedule 모델과 월 뷰는
 *   P1 에서 추가한다. 그때 이 블록의 props(boardSlug)는 유지하고
 *   loader 만 교체할 수 있도록 계약을 좁게 잡아 두었다.
 */

const propsSchema = z.object({
  heading: z.string().max(40).default("학사일정"),
  boardSlug: z.string().min(1).max(60).default("calendar"),
  count: z.number().int().min(1).max(10).default(5),
});

type Props = z.infer<typeof propsSchema>;

type ScheduleItem = {
  id: string;
  title: string;
  href: string;
  monthDay: string;
  weekday: string;
  dateTime: string;
};

type Data = { items: ScheduleItem[]; moreHref: string };

function Calendar({ props, data }: BlockRenderProps<Props, Data>) {
  const headingId = `calendar-${props.boardSlug}-heading`;

  return (
    <section aria-labelledby={headingId} className="bg-surface">
      <div className="mx-auto w-full max-w-[120rem] px-6 py-12">
        <div className="mb-5 flex items-baseline justify-between gap-4">
          <h2 id={headingId} className="text-[2.4rem] font-bold text-bolder">
            {props.heading}
          </h2>
          <a
            href={data.moreHref}
            className="text-[1.5rem] text-brand underline underline-offset-4"
          >
            전체 일정
            <span className="sr-only-krds"> — {props.heading}</span>
          </a>
        </div>

        {data.items.length === 0 ? (
          <p className="rounded-krds-md border border-line bg-surface-subtle px-5 py-8 text-center text-[1.5rem] text-subtle">
            등록된 일정이 없습니다.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {data.items.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  className="flex items-center gap-4 rounded-krds-md border border-line px-5 py-4 no-underline hover:bg-surface-subtle"
                >
                  <time
                    dateTime={item.dateTime}
                    className="flex w-[7rem] shrink-0 flex-col items-center rounded-krds-sm bg-surface-primary py-2"
                  >
                    <span className="text-[1.6rem] font-bold text-brand">
                      {item.monthDay}
                    </span>
                    <span className="text-[1.3rem] text-subtle">
                      {item.weekday}
                    </span>
                  </time>
                  <span className="min-w-0 truncate text-[1.6rem] text-basic">
                    {item.title}
                  </span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export const calendarBlock = defineBlock<Props, Data>({
  type: "calendar",
  label: "학사일정",
  description: "다가오는 학사일정을 날짜와 함께 보여줍니다.",
  category: "안내",
  schema: propsSchema,
  defaults: { heading: "학사일정", boardSlug: "calendar", count: 5 },
  emptyData: { items: [], moreHref: "#" },
  settings: [
    { kind: "text", name: "heading", label: "제목", maxLength: 40 },
    { kind: "board", name: "boardSlug", label: "학사일정 게시판" },
    { kind: "number", name: "count", label: "표시 개수", min: 1, max: 10 },
  ],
  loader: async ({ props, ctx }) => {
    // "다가오는" 일정이므로 오늘 이후만, 가까운 순서로 가져온다.
    const posts = await findBoardPosts(
      ctx,
      props.boardSlug,
      props.count,
      "upcoming",
    );

    return {
      items: posts
        .filter((post) => post.publishedAt !== null)
        .map((post) => {
          const date = post.publishedAt as Date;
          return {
            id: post.id,
            title: post.title,
            href: `/${props.boardSlug}/${post.id}`,
            monthDay: formatMonthDay(date),
            weekday: formatWeekday(date),
            dateTime: toDateTimeAttribute(date),
          };
        }),
      moreHref: `/${props.boardSlug}`,
    };
  },
  Component: Calendar,
});
