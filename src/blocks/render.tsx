import type { ReactNode } from "react";
import type { SiteSummary, BlockRenderMode } from "@/blocks/types";
import type { TenantContext } from "@/lib/tenant";
import { resolveLayoutForRender, type LayoutIssue } from "@/lib/page-json";

/**
 * 레이아웃 렌더링.
 *
 * 공개 사이트(Public Renderer)와 빌더 미리보기가 모두 이 함수를 거친다.
 * 두 화면이 같은 결과를 내는 이유가 여기 있다:
 *   - 같은 레지스트리에서 같은 컴포넌트를 꺼내고
 *   - 같은 loader 로 같은 데이터를 만들고
 *   - mode 값만 다르게 넘긴다 (컴포넌트는 mode 로 화면을 바꾸지 않는다)
 */

export type RenderedLayout = {
  nodes: ReactNode[];
  /** 건너뛴 블록 + loader 가 실패한 블록. 호출부에서 로그로 남긴다. */
  issues: LayoutIssue[];
};

export async function renderLayout(args: {
  layout: unknown;
  ctx: TenantContext;
  site: SiteSummary;
  mode: BlockRenderMode;
}): Promise<RenderedLayout> {
  const { layout, ctx, site, mode } = args;
  const { blocks, skipped } = resolveLayoutForRender(layout);
  const issues: LayoutIssue[] = [...skipped];

  // loader 를 순차가 아니라 동시에 돌린다.
  // 블록이 6개면 순차 실행은 그대로 6배 느려지고, 그 차이가 학교 홈페이지
  // 첫 화면 응답 시간에 그대로 드러난다.
  const loaded = await Promise.all(
    blocks.map(async (block, index) => {
      const { definition, props } = block;
      if (!definition.loader) return definition.emptyData;

      try {
        return await definition.loader({ props, ctx });
      } catch (error) {
        // 게시판 하나를 못 읽었다고 학교 홈페이지 전체가 죽으면 안 된다.
        // 해당 블록만 빈 상태로 그리고 문제를 기록한다.
        issues.push({
          index,
          blockId: block.id,
          type: definition.type,
          reason: `데이터를 불러오지 못했습니다: ${
            error instanceof Error ? error.message : String(error)
          }`,
        });
        return definition.emptyData;
      }
    }),
  );

  const nodes = blocks.map((block, index) => {
    const { Component } = block.definition;
    return (
      <Component
        key={block.id}
        props={block.props}
        data={loaded[index]}
        mode={mode}
        site={site}
      />
    );
  });

  return { nodes, issues };
}
