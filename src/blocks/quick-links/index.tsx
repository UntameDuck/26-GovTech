import { z } from "zod";
import { defineBlock, type BlockRenderProps } from "@/blocks/types";

/**
 * QuickLinks — 자주 찾는 메뉴 카드.
 *
 * 학교 홈페이지에서 방문자가 실제로 누르는 소수의 링크(급식, 학사일정,
 * 가정통신문, 오시는 길 등)를 위로 끌어올리는 블록.
 */

const linkSchema = z.object({
  label: z.string().min(1).max(20),
  /** 사이트 내부 경로(/notice) 또는 외부 URL. javascript: 는 허용하지 않는다. */
  href: z
    .string()
    .min(1)
    .max(300)
    .refine(
      (value) => value.startsWith("/") || /^https?:\/\//i.test(value),
      { message: "내부 경로(/로 시작) 또는 http(s) 주소만 넣을 수 있습니다." },
    ),
  description: z.string().max(40).default(""),
});

const propsSchema = z.object({
  heading: z.string().max(40).default("자주 찾는 메뉴"),
  /** 카드가 너무 많으면 오히려 안 눌린다. 8개로 제한한다. */
  links: z.array(linkSchema).max(8).default([]),
});

type Props = z.infer<typeof propsSchema>;

function QuickLinks({ props }: BlockRenderProps<Props>) {
  if (props.links.length === 0) return null;

  const isExternal = (href: string) => /^https?:\/\//i.test(href);

  return (
    <section aria-labelledby="quick-links-heading" className="bg-surface">
      <div className="mx-auto w-full max-w-[120rem] px-6 py-12">
        <h2
          id="quick-links-heading"
          className="mb-6 text-[2.4rem] font-bold text-bolder"
        >
          {props.heading}
        </h2>
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {props.links.map((link, index) => (
            <li key={`${link.href}-${index}`}>
              <a
                href={link.href}
                {...(isExternal(link.href)
                  ? { target: "_blank", rel: "noopener noreferrer" }
                  : {})}
                className="flex h-full flex-col justify-center gap-1 rounded-krds-md border border-line bg-surface-subtle px-5 py-6 no-underline transition-colors hover:bg-surface-muted"
              >
                <span className="text-[1.7rem] font-bold text-bolder">
                  {link.label}
                  {isExternal(link.href) ? (
                    <span className="sr-only-krds"> (새 창에서 열림)</span>
                  ) : null}
                </span>
                {link.description ? (
                  <span className="text-[1.4rem] text-subtle">
                    {link.description}
                  </span>
                ) : null}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export const quickLinksBlock = defineBlock<Props>({
  type: "quickLinks",
  label: "자주 찾는 메뉴",
  description: "방문자가 가장 많이 누르는 링크를 카드로 모아 보여줍니다.",
  category: "안내",
  schema: propsSchema,
  defaults: {
    heading: "자주 찾는 메뉴",
    links: [
      { label: "공지사항", href: "/notice", description: "" },
      { label: "가정통신문", href: "/letters", description: "" },
      { label: "학사일정", href: "/calendar", description: "" },
      { label: "오시는 길", href: "/location", description: "" },
    ],
  },
  emptyData: undefined,
  settings: [
    { kind: "text", name: "heading", label: "제목", maxLength: 40 },
    {
      kind: "linkList",
      name: "links",
      label: "링크 목록",
      help: "최대 8개까지 넣을 수 있습니다. 너무 많으면 오히려 찾기 어려워집니다.",
      maxItems: 8,
    },
  ],
  Component: QuickLinks,
});
