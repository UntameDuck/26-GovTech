"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getDevAdminContext } from "@/lib/dev-admin";
import {
  findEditablePage,
  createBlockDataSource,
  TenantBoundaryError,
} from "@/lib/tenant";
import {
  parseLayoutForSave,
  resolveLayoutForRender,
  InvalidLayoutError,
} from "@/lib/page-json";

/**
 * 빌더가 호출하는 서버 액션.
 *
 * 세 가지가 명확히 분리되어 있다.
 *
 *   loadPreviewData — 미리보기용 데이터만 만든다 (쓰기 없음)
 *   saveDraft       — draftLayout 만 갱신한다 (공개 사이트 변화 없음)
 *   publishPage     — publishedLayout 을 갱신하고 리비전을 남긴다
 *
 * saveDraft 와 publishPage 를 나눈 것이 핵심이다.
 * 편집 중 자동 저장이 그대로 학교 홈페이지에 나가면 승인 절차가 무의미해진다.
 */

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * 검증을 통과한 레이아웃을 Prisma 의 Json 입력 타입으로 넘긴다.
 *
 * parseLayoutForSave 는 Zod 스키마를 통과한 값만 돌려주고, Zod 스키마는
 * 원시값/배열/객체만 만들어 내므로 JSON 직렬화가 항상 가능하다.
 * 다만 props 의 정적 타입이 unknown 이라 Prisma 가 받아 주지 않기 때문에
 * 변환을 이 함수 한 곳에만 둔다. 여기저기 캐스팅이 흩어지지 않게 하려는 것이다.
 */
function toJson(layout: ReturnType<typeof parseLayoutForSave>) {
  return layout as unknown as Prisma.InputJsonValue;
}

/**
 * 미리보기 데이터.
 *
 * 블록 컴포넌트 자체는 클라이언트에서 렌더링하되, loader 는 여기(서버)에서
 * 돌린다. 공개 사이트와 같은 loader 를 쓰므로 두 화면의 데이터가 갈라지지 않는다.
 *
 * 반환값은 blockId → data 형태이며 JSON 직렬화가 가능해야 한다.
 */
export async function loadPreviewData(
  layout: unknown,
): Promise<ActionResult<Record<string, unknown>>> {
  try {
    const ctx = await getDevAdminContext();
    const { blocks } = resolveLayoutForRender(layout);
    const source = createBlockDataSource(ctx);

    const entries = await Promise.all(
      blocks.map(async (block) => {
        const { definition, props } = block;
        if (!definition.loader) {
          return [block.id, definition.emptyData] as const;
        }
        try {
          return [block.id, await definition.loader({ props, source })] as const;
        } catch {
          // 미리보기에서 게시판 하나를 못 읽었다고 편집을 막지 않는다.
          return [block.id, definition.emptyData] as const;
        }
      }),
    );

    return { ok: true, data: Object.fromEntries(entries) };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/** 편집 중인 레이아웃을 저장한다. 공개 사이트는 바뀌지 않는다. */
export async function saveDraft(
  pageId: string,
  layout: unknown,
): Promise<ActionResult<{ savedAt: string }>> {
  try {
    const ctx = await getDevAdminContext();
    await findEditablePage(ctx, pageId); // 테넌트 경계 확인

    const validated = parseLayoutForSave(layout);

    const updated = await prisma.page.update({
      where: { id: pageId },
      data: { draftLayout: toJson(validated), status: "DRAFT" },
      select: { updatedAt: true },
    });

    await writeAudit(ctx, "PAGE_DRAFT_SAVE", pageId, {
      blockCount: validated.length,
    });

    return { ok: true, data: { savedAt: updated.updatedAt.toISOString() } };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

/**
 * 편집본을 공개한다.
 *
 * draftLayout 을 publishedLayout 으로 옮기고, 그 시점의 스냅샷을
 * PageRevision 으로 남긴다. 되돌리기의 근거가 된다.
 */
export async function publishPage(
  pageId: string,
  layout: unknown,
): Promise<ActionResult<{ publishedAt: string; revision: number }>> {
  try {
    const ctx = await getDevAdminContext();
    const page = await findEditablePage(ctx, pageId);

    const validated = parseLayoutForSave(layout);
    const publishedAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const last = await tx.pageRevision.findFirst({
        where: { pageId },
        orderBy: { revision: "desc" },
        select: { revision: true },
      });
      const revision = (last?.revision ?? 0) + 1;

      await tx.pageRevision.create({
        data: {
          pageId,
          revision,
          layout: toJson(validated),
          createdBy: ctx.userId,
        },
      });

      await tx.page.update({
        where: { id: pageId },
        data: {
          draftLayout: toJson(validated),
          publishedLayout: toJson(validated),
          status: "PUBLISHED",
          publishedAt,
        },
      });

      return { revision };
    });

    await writeAudit(ctx, "PAGE_PUBLISH", pageId, {
      revision: result.revision,
      blockCount: validated.length,
    });

    // 공개 사이트가 새 내용을 곧바로 보여주도록 캐시를 무효화한다.
    revalidatePath(`/${page.slug}`);
    revalidatePath("/");

    return {
      ok: true,
      data: { publishedAt: publishedAt.toISOString(), revision: result.revision },
    };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

// ---------------------------------------------------------------- 내부

async function writeAudit(
  ctx: { userId: string; organizationId: string; siteId?: string },
  action: string,
  pageId: string,
  detail: Record<string, unknown>,
) {
  await prisma.auditLog.create({
    data: {
      // dev 스텁 사용자는 User 레코드가 없으므로 actorId 는 비워 둔다.
      actorId: null,
      organizationId: ctx.organizationId,
      siteId: ctx.siteId ?? null,
      action,
      resource: `Page:${pageId}`,
      detail: { ...detail, actor: ctx.userId },
    },
  });
}

function toMessage(error: unknown): string {
  if (error instanceof InvalidLayoutError) return error.message;
  if (error instanceof TenantBoundaryError) {
    // 경계 밖 자원은 존재 자체를 알리지 않는다.
    return "페이지를 찾을 수 없습니다.";
  }
  if (error instanceof Error) return error.message;
  return "알 수 없는 오류가 발생했습니다.";
}
