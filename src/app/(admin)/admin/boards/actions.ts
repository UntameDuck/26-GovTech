"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  requireCapability,
  NotAuthenticatedError,
  NotAuthorizedError,
  type AdminSession,
} from "@/lib/session";
import { recordAudit } from "@/lib/audit";
import { findAdminPost, requireBoard, TenantBoundaryError } from "@/lib/tenant";

/**
 * 게시판 콘텐츠 관리.
 *
 * 문서 05 의 4단계 완료 조건 중 "게시판 콘텐츠를 수정하고 공개 사이트에
 * 반영할 수 있다"에 해당한다.
 *
 * 페이지 레이아웃과 마찬가지로 저장과 공개를 분리한다.
 *   저장(DRAFT)  — EDIT_CONTENT
 *   공개(PUBLISH) — PUBLISH_POST
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

/**
 * 본문 길이 상한.
 *
 * 상한이 없으면 한 건으로 DB 와 공개 페이지를 모두 무겁게 만들 수 있다.
 * 학교 공지 기준으로 넉넉한 값이며, 첨부는 별도 Asset 으로 다룬다.
 */
const MAX_BODY = 20000;

const postSchema = z.object({
  title: z.string().trim().min(1, "제목을 입력하세요.").max(200),
  body: z.string().max(MAX_BODY),
  pinned: z.boolean(),
});

function parseForm(formData: FormData) {
  return postSchema.safeParse({
    title: String(formData.get("title") ?? ""),
    body: String(formData.get("body") ?? ""),
    pinned: formData.get("pinned") === "on",
  });
}

// ---------------------------------------------------------------- 작성 / 수정

export async function createPost(
  boardSlug: string,
  formData: FormData,
): Promise<ActionResult> {
  let createdId: string;

  try {
    const session = await requireCapability("EDIT_CONTENT");
    const board = await requireBoard(session, boardSlug);

    const parsed = parseForm(formData);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error) };
    }

    const post = await prisma.post.create({
      data: {
        boardId: board.id,
        siteId: board.siteId,
        title: parsed.data.title,
        body: parsed.data.body,
        pinned: parsed.data.pinned,
        // 새 글은 항상 초안으로 시작한다. 실수로 바로 공개되는 일이 없어야 한다.
        status: "DRAFT",
        authorId: session.userId,
      },
      select: { id: true },
    });

    await audit(session, "POST_CREATE", post.id, {
      board: boardSlug,
      title: parsed.data.title,
    });

    createdId = post.id;
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }

  // redirect 는 예외를 던져 동작하므로 try 블록 밖에서 호출한다.
  redirect(`/admin/boards/${boardSlug}/${createdId}`);
}

export async function updatePost(
  postId: string,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await requireCapability("EDIT_CONTENT");
    const existing = await findAdminPost(session, postId);

    const parsed = parseForm(formData);
    if (!parsed.success) {
      return { ok: false, error: firstIssue(parsed.error) };
    }

    await prisma.post.update({
      where: { id: postId },
      data: {
        title: parsed.data.title,
        body: parsed.data.body,
        pinned: parsed.data.pinned,
      },
    });

    await audit(session, "POST_UPDATE", postId, {
      board: existing.board.slug,
      status: existing.status,
    });

    revalidatePath(`/${existing.board.slug}`);
    revalidatePath(`/${existing.board.slug}/${postId}`);
    revalidatePath("/");

    return { ok: true, message: "저장했습니다." };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

// ---------------------------------------------------------------- 공개 / 숨김

export async function publishPost(postId: string): Promise<ActionResult> {
  try {
    const session = await requireCapability("PUBLISH_POST");
    const post = await findAdminPost(session, postId);

    await prisma.post.update({
      where: { id: postId },
      data: {
        status: "PUBLISHED",
        // 이미 발행 시각이 있으면 유지한다. 수정할 때마다 날짜가 바뀌면
        // 목록 순서가 흔들리고 학부모가 "새 글"로 오인한다.
        publishedAt: post.publishedAt ?? new Date(),
      },
    });

    await audit(session, "POST_PUBLISH", postId, { board: post.board.slug });

    revalidatePath(`/${post.board.slug}`);
    revalidatePath("/");

    return { ok: true, message: "공개했습니다." };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

export async function unpublishPost(postId: string): Promise<ActionResult> {
  try {
    const session = await requireCapability("PUBLISH_POST");
    const post = await findAdminPost(session, postId);

    await prisma.post.update({
      where: { id: postId },
      data: { status: "HIDDEN" },
    });

    await audit(session, "POST_UNPUBLISH", postId, { board: post.board.slug });

    revalidatePath(`/${post.board.slug}`);
    revalidatePath("/");

    return { ok: true, message: "공개를 중지했습니다." };
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }
}

// ---------------------------------------------------------------- 삭제

export async function deletePost(postId: string): Promise<ActionResult> {
  let boardSlug: string;

  try {
    // 삭제는 공개 중지보다 무겁다. 공개 권한을 요구한다.
    const session = await requireCapability("PUBLISH_POST");
    const post = await findAdminPost(session, postId);
    boardSlug = post.board.slug;

    await prisma.post.delete({ where: { id: postId } });

    await audit(session, "POST_DELETE", postId, {
      board: boardSlug,
      title: post.title,
    });

    revalidatePath(`/${boardSlug}`);
    revalidatePath("/");
  } catch (error) {
    return { ok: false, error: toMessage(error) };
  }

  redirect(`/admin/boards/${boardSlug}`);
}

// ---------------------------------------------------------------- 내부

async function audit(
  session: AdminSession,
  action: string,
  postId: string,
  detail: Record<string, unknown>,
) {
  await recordAudit({
    action,
    actorId: session.userId,
    organizationId: session.organizationId,
    siteId: session.siteId ?? null,
    resource: `Post:${postId}`,
    detail: { ...detail, role: session.role },
  });
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "입력값이 올바르지 않습니다.";
}

function toMessage(error: unknown): string {
  if (error instanceof NotAuthenticatedError) {
    return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  }
  if (error instanceof NotAuthorizedError) {
    return "이 작업을 수행할 권한이 없습니다. 승인 권한이 있는 담당자에게 요청하세요.";
  }
  if (error instanceof TenantBoundaryError) {
    return "게시물을 찾을 수 없습니다.";
  }
  if (error instanceof Error) return error.message;
  return "알 수 없는 오류가 발생했습니다.";
}
