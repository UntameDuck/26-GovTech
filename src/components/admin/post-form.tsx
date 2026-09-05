"use client";

import { useState, useTransition } from "react";
import {
  createPost,
  updatePost,
  publishPost,
  unpublishPost,
  deletePost,
  type ActionResult,
} from "@/app/(admin)/admin/boards/actions";

/**
 * 게시물 작성·수정 폼.
 *
 * 본문은 서식 없는 일반 텍스트다. 리치 에디터를 붙이지 않은 것은 기능을
 * 덜 만든 것이 아니라 결정이다. 임의 HTML 을 허용하지 않는다는 원칙(문서 02)이
 * 게시물 본문에도 그대로 적용되고, 공개 화면도 HTML 을 해석하지 않는다.
 * 서식이 필요해지면 제한된 마크업만 파싱하는 렌더러를 따로 만든다.
 */

type Mode =
  | { kind: "create"; boardSlug: string }
  | {
      kind: "edit";
      postId: string;
      status: string;
      canPublish: boolean;
    };

export function PostForm({
  mode,
  initial,
}: {
  mode: Mode;
  initial: { title: string; body: string; pinned: boolean };
}) {
  const [result, setResult] = useState<ActionResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      setResult(null);
      const next =
        mode.kind === "create"
          ? await createPost(mode.boardSlug, formData)
          : await updatePost(mode.postId, formData);
      // createPost 는 성공 시 redirect 로 빠져나가므로 여기 도달하지 않는다.
      setResult(next);
    });
  }

  function runAction(action: () => Promise<ActionResult>) {
    startTransition(async () => {
      setResult(null);
      setResult(await action());
    });
  }

  return (
    <form action={handleSubmit} className="flex flex-col gap-5">
      {result ? (
        <p
          role="alert"
          className={[
            "rounded-krds-sm px-4 py-3 text-[1.4rem]",
            result.ok
              ? "border border-line bg-surface-primary text-brand"
              : "border border-[var(--krds-border-danger)] bg-[var(--krds-surface-danger-subtler)] text-danger",
          ].join(" ")}
        >
          {result.ok ? result.message : result.error}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="title" className="text-[1.4rem] font-bold text-basic">
          제목
        </label>
        <input
          id="title"
          name="title"
          type="text"
          required
          maxLength={200}
          defaultValue={initial.title}
          className="rounded-krds-sm border border-line bg-surface px-4 py-3 text-[1.6rem] text-basic"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="body" className="text-[1.4rem] font-bold text-basic">
          내용
        </label>
        <textarea
          id="body"
          name="body"
          rows={16}
          maxLength={20000}
          defaultValue={initial.body}
          aria-describedby="body-help"
          className="rounded-krds-sm border border-line bg-surface px-4 py-3 text-[1.5rem] leading-relaxed text-basic"
        />
        <p id="body-help" className="text-[1.3rem] text-subtle">
          줄바꿈은 그대로 표시됩니다. HTML 태그는 해석되지 않고 글자 그대로 보입니다.
        </p>
      </div>

      <label className="flex items-center gap-2 text-[1.4rem] text-basic">
        <input
          type="checkbox"
          name="pinned"
          defaultChecked={initial.pinned}
          className="h-4 w-4"
        />
        목록 맨 위에 고정
      </label>

      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-krds-sm border border-line bg-surface px-5 py-3 text-[1.4rem] text-basic disabled:opacity-50"
        >
          {mode.kind === "create" ? "초안으로 저장" : "저장"}
        </button>

        {mode.kind === "edit" && mode.canPublish ? (
          mode.status === "PUBLISHED" ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => runAction(() => unpublishPost(mode.postId))}
              className="rounded-krds-sm border border-line bg-surface px-5 py-3 text-[1.4rem] text-basic disabled:opacity-50"
            >
              공개 중지
            </button>
          ) : (
            <button
              type="button"
              disabled={isPending}
              onClick={() => runAction(() => publishPost(mode.postId))}
              className="rounded-krds-sm bg-[var(--krds-action-secondary-active)] px-5 py-3 text-[1.4rem] font-bold text-[var(--krds-text-disabled-on)] disabled:opacity-50"
            >
              공개하기
            </button>
          )
        ) : null}

        {mode.kind === "edit" && mode.canPublish ? (
          <div className="ml-auto">
            {/*
              삭제는 되돌릴 수 없으므로 한 번 더 묻는다.
              window.confirm 을 쓰지 않는 이유: 브라우저 대화상자는 스타일과
              초점 관리를 우리가 제어할 수 없고, 일부 환경에서 차단된다.
            */}
            {confirmingDelete ? (
              <span className="flex items-center gap-2">
                <span className="text-[1.3rem] text-danger">삭제할까요?</span>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => runAction(() => deletePost(mode.postId))}
                  className="rounded-krds-sm border border-[var(--krds-border-danger)] px-4 py-2 text-[1.3rem] font-bold text-danger disabled:opacity-50"
                >
                  삭제
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(false)}
                  className="text-[1.3rem] text-subtle underline"
                >
                  취소
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="text-[1.3rem] text-danger underline underline-offset-4"
              >
                이 글 삭제
              </button>
            )}
          </div>
        ) : null}
      </div>
    </form>
  );
}
