import { z } from "zod";
import { defineBlock, type BlockRenderProps } from "@/blocks/types";

/**
 * Hero — 학교 대표 영역.
 *
 * 조사한 실제 학교 홈페이지(대전대신고, 대전동화중)에서 공통으로 나타나는
 * "학교명 + 한 줄 소개 + 대표 이미지" 형태를 블록 하나로 고정한 것이다.
 * 자유 배치를 주지 않는 대신, 어떤 학교가 써도 무너지지 않는 레이아웃을 보장한다.
 */

const propsSchema = z.object({
  /** 비우면 사이트 이름을 그대로 쓴다. */
  title: z.string().max(60).default(""),
  subtitle: z.string().max(120).default(""),
  /** Asset.id. 비우면 단색 배경으로 렌더링한다. */
  imageAssetId: z.string().default(""),
  align: z.enum(["left", "center"]).default("left"),
});

type Props = z.infer<typeof propsSchema>;

function Hero({ props, site }: BlockRenderProps<Props>) {
  const heading = props.title.trim() || site.name;
  const centered = props.align === "center";

  return (
    <section
      aria-label="학교 소개"
      className="bg-surface-primary border-b border-line"
    >
      <div
        className={[
          "mx-auto flex w-full max-w-[120rem] flex-col gap-3 px-6 py-16 md:py-24",
          centered ? "items-center text-center" : "items-start text-left",
        ].join(" ")}
      >
        <h1 className="text-[3.2rem] leading-tight font-bold text-bolder md:text-[4rem]">
          {heading}
        </h1>
        {props.subtitle.trim() ? (
          <p className="max-w-[70rem] text-[1.8rem] text-subtle">
            {props.subtitle}
          </p>
        ) : null}
      </div>
    </section>
  );
}

export const heroBlock = defineBlock<Props>({
  type: "hero",
  label: "학교 대표 영역",
  description: "학교명과 한 줄 소개를 보여주는 첫 화면 영역입니다.",
  category: "머리말",
  schema: propsSchema,
  defaults: { title: "", subtitle: "", imageAssetId: "", align: "left" },
  emptyData: undefined,
  settings: [
    {
      kind: "text",
      name: "title",
      label: "제목",
      help: "비워 두면 사이트 이름이 자동으로 들어갑니다.",
      maxLength: 60,
    },
    {
      kind: "text",
      name: "subtitle",
      label: "한 줄 소개",
      maxLength: 120,
    },
    { kind: "image", name: "imageAssetId", label: "배경 이미지" },
    {
      kind: "select",
      name: "align",
      label: "정렬",
      options: [
        { value: "left", label: "왼쪽" },
        { value: "center", label: "가운데" },
      ],
    },
  ],
  Component: Hero,
});
