import { z } from "zod";
import { getBlockDefinition } from "@/blocks/registry";
import type { AnyBlockDefinition } from "@/blocks/types";

/**
 * Page JSON — 페이지 레이아웃의 저장 형식.
 *
 *   [
 *     { "id": "hero-1",   "type": "hero",        "props": { ... } },
 *     { "id": "notice-1", "type": "noticeBoard", "props": { ... } }
 *   ]
 *
 * 검증을 두 단계로 나눈다.
 *
 *   1. 구조 검증  — id/type/props 형태가 맞는가 (아래 blockInstanceSchema)
 *   2. 내용 검증  — props 가 그 블록의 스키마를 통과하는가 (레지스트리 조회)
 *
 * 저장(=쓰기)과 렌더(=읽기)에서 실패 처리 방식이 다르다.
 *
 *   저장: 하나라도 어긋나면 전부 거부한다. 잘못된 데이터를 DB 에 넣지 않는다.
 *   렌더: 문제가 있는 블록만 건너뛰고 나머지는 그린다.
 *
 * 두 번째가 중요하다. 이미 공개된 학교 홈페이지는, 나중에 블록을 제거하거나
 * 스키마를 바꿨다는 이유로 페이지 전체가 500 이 되면 안 된다.
 * 공지사항이 안 보이는 것보다 사이트가 통째로 죽는 게 훨씬 나쁘다.
 */

export const blockInstanceSchema = z.object({
  /** 페이지 안에서 유일한 식별자. 드래그 정렬과 React key 로 쓴다. */
  id: z.string().min(1).max(64),
  type: z.string().min(1).max(64),
  props: z.unknown(),
});

export type BlockInstance = z.infer<typeof blockInstanceSchema>;

export const pageLayoutSchema = z.array(blockInstanceSchema).max(50);

/** 검증을 통과해, 정의와 props 가 확정된 블록. */
export type ResolvedBlock = {
  id: string;
  definition: AnyBlockDefinition;
  props: unknown;
};

export type LayoutIssue = {
  index: number;
  blockId: string;
  type: string;
  reason: string;
};

// ---------------------------------------------------------------- 저장 경로

export class InvalidLayoutError extends Error {
  constructor(public readonly issues: LayoutIssue[]) {
    super(
      `레이아웃을 저장할 수 없습니다. 문제 ${issues.length}건: ` +
        issues.map((i) => `[${i.index}] ${i.type} — ${i.reason}`).join(", "),
    );
    this.name = "InvalidLayoutError";
  }
}

/**
 * 저장 전 검증. 하나라도 문제가 있으면 던진다.
 * 통과하면 props 가 각 블록 스키마로 파싱된(기본값이 채워진) 레이아웃을 돌려준다.
 */
export function parseLayoutForSave(raw: unknown): BlockInstance[] {
  const structural = pageLayoutSchema.safeParse(raw);
  if (!structural.success) {
    throw new InvalidLayoutError([
      {
        index: -1,
        blockId: "",
        type: "",
        reason: "Page JSON 의 기본 구조가 올바르지 않습니다.",
      },
    ]);
  }

  const issues: LayoutIssue[] = [];
  const seenIds = new Set<string>();
  const result: BlockInstance[] = [];

  structural.data.forEach((block, index) => {
    if (seenIds.has(block.id)) {
      issues.push({
        index,
        blockId: block.id,
        type: block.type,
        reason: `id 가 중복되었습니다: ${block.id}`,
      });
      return;
    }
    seenIds.add(block.id);

    const definition = getBlockDefinition(block.type);
    if (!definition) {
      issues.push({
        index,
        blockId: block.id,
        type: block.type,
        reason: "등록되지 않은 블록 종류입니다.",
      });
      return;
    }

    const parsed = definition.schema.safeParse(block.props);
    if (!parsed.success) {
      issues.push({
        index,
        blockId: block.id,
        type: block.type,
        reason: parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(루트)"}: ${issue.message}`)
          .join("; "),
      });
      return;
    }

    result.push({ id: block.id, type: block.type, props: parsed.data });
  });

  if (issues.length > 0) throw new InvalidLayoutError(issues);
  return result;
}

// ---------------------------------------------------------------- 렌더 경로

export type ResolvedLayout = {
  blocks: ResolvedBlock[];
  /** 건너뛴 블록. 렌더는 계속하되 운영자에게 보고할 수 있게 남긴다. */
  skipped: LayoutIssue[];
};

/**
 * 렌더용 해석. 문제가 있는 블록은 조용히 빼고 나머지를 돌려준다.
 * 호출부는 skipped 를 로그/감사기록으로 남겨야 한다. 무시하면 안 된다.
 */
export function resolveLayoutForRender(raw: unknown): ResolvedLayout {
  const structural = pageLayoutSchema.safeParse(raw);
  if (!structural.success) {
    return {
      blocks: [],
      skipped: [
        {
          index: -1,
          blockId: "",
          type: "",
          reason: "Page JSON 의 기본 구조가 올바르지 않습니다.",
        },
      ],
    };
  }

  const blocks: ResolvedBlock[] = [];
  const skipped: LayoutIssue[] = [];

  structural.data.forEach((block, index) => {
    const definition = getBlockDefinition(block.type);
    if (!definition) {
      skipped.push({
        index,
        blockId: block.id,
        type: block.type,
        reason: "등록되지 않은 블록 종류입니다.",
      });
      return;
    }

    const parsed = definition.schema.safeParse(block.props);
    if (!parsed.success) {
      skipped.push({
        index,
        blockId: block.id,
        type: block.type,
        reason: parsed.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }

    blocks.push({ id: block.id, definition, props: parsed.data });
  });

  return { blocks, skipped };
}

/** 빌더에서 새 블록을 추가할 때 쓸 인스턴스를 만든다. */
export function createBlockInstance(type: string): BlockInstance {
  const definition = getBlockDefinition(type);
  if (!definition) {
    throw new Error(`등록되지 않은 블록 종류입니다: ${type}`);
  }

  return {
    id: `${type}-${Math.random().toString(36).slice(2, 10)}`,
    type,
    props: structuredClone(definition.defaults),
  };
}
