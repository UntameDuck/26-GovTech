import { z } from "zod";
import { defineBlock, type BlockRenderProps } from "@/blocks/types";
import { findBoardPosts } from "@/lib/tenant";
import { formatMonthDay, formatWeekday, toDateTimeAttribute } from "@/lib/format";

/**
 * Meal — 급식 식단.
 *
 * MVP 범위에 대한 솔직한 메모:
 *   전용 Meal 모델 없이 "급식 게시판"의 게시물을 날짜순으로 읽는다.
 *   게시물 제목에 그날 메뉴가 쉼표 또는 줄바꿈으로 들어 있다고 가정한다.
 *   (예: "쌀밥, 미역국, 제육볶음, 배추김치")
 *   나이스(NEIS) 급식 API 연동과 알레르기 정보 표기는 P1 이후 과제다.
 *   알레르기 정보는 표시 의무가 있으므로, 실제 학교에 배포하기 전에는
 *   반드시 채워야 한다. 지금 구조에서는 loader 만 바꾸면 된다.
 */

const propsSchema = z.object({
  heading: z.string().max(40).default("오늘의 급식"),
  boardSlug: z.string().min(1).max(60).default("meal"),
  /** 며칠치를 보여줄지. 1이면 오늘 것만. */
  days: z.number().int().min(1).max(7).default(3),
});

type Props = z.infer<typeof propsSchema>;

type MealItem = {
  id: string;
  monthDay: string;
  weekday: string;
  dateTime: string;
  /** 식단 본문. 줄바꿈으로 구분된 메뉴 목록. */
  menu: string[];
  href: string;
};

type Data = { items: MealItem[]; moreHref: string };

function Meal({ props, data }: BlockRenderProps<Props, Data>) {
  const headingId = `meal-${props.boardSlug}-heading`;

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
            식단표 전체
            <span className="sr-only-krds"> — {props.heading}</span>
          </a>
        </div>

        {data.items.length === 0 ? (
          <p className="rounded-krds-md border border-line bg-surface px-5 py-8 text-center text-[1.5rem] text-subtle">
            등록된 식단이 없습니다.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.items.map((item) => (
              <li
                key={item.id}
                className="rounded-krds-md border border-line bg-surface p-5"
              >
                <time
                  dateTime={item.dateTime}
                  className="mb-3 flex items-baseline gap-2"
                >
                  <span className="text-[1.8rem] font-bold text-bolder">
                    {item.monthDay}
                  </span>
                  <span className="text-[1.4rem] text-subtle">
                    {item.weekday}
                  </span>
                </time>
                {item.menu.length === 0 ? (
                  <p className="text-[1.5rem] text-subtle">식단 정보 없음</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {item.menu.map((line, index) => (
                      <li key={index} className="text-[1.5rem] text-basic">
                        {line}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export const mealBlock = defineBlock<Props, Data>({
  type: "meal",
  label: "급식 식단",
  description: "급식 게시판의 식단을 날짜별 카드로 보여줍니다.",
  category: "안내",
  schema: propsSchema,
  defaults: { heading: "오늘의 급식", boardSlug: "meal", days: 3 },
  emptyData: { items: [], moreHref: "#" },
  settings: [
    { kind: "text", name: "heading", label: "제목", maxLength: 40 },
    { kind: "board", name: "boardSlug", label: "급식 게시판" },
    {
      kind: "number",
      name: "days",
      label: "표시 일수",
      help: "1이면 가장 최근 식단만 보여줍니다.",
      min: 1,
      max: 7,
    },
  ],
  loader: async ({ props, ctx }) => {
    // 오늘 급식은 오전에도 보여야 하므로 "오늘 24시까지"로 잡는다.
    const posts = await findBoardPosts(
      ctx,
      props.boardSlug,
      props.days,
      "throughToday",
    );

    return {
      items: posts
        .filter((post) => post.publishedAt !== null)
        .map((post) => {
          const date = post.publishedAt as Date;
          return {
            id: post.id,
            monthDay: formatMonthDay(date),
            weekday: formatWeekday(date),
            dateTime: toDateTimeAttribute(date),
            menu: post.title
              .split(/[\n,]/)
              .map((line) => line.trim())
              .filter(Boolean),
            href: `/${props.boardSlug}/${post.id}`,
          };
        }),
      moreHref: `/${props.boardSlug}`,
    };
  },
  Component: Meal,
});
