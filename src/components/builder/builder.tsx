"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { blockLibrary, getBlockDefinition } from "@/blocks/registry";
import type { SiteSummary } from "@/blocks/types";
import { createBlockInstance, type BlockInstance } from "@/lib/page-json";
import { SettingsPanel, type BoardOption } from "@/components/builder/settings-panel";
import {
  loadPreviewData,
  saveDraft,
  publishPage,
  requestReview,
  signOutAction,
} from "@/app/(admin)/admin/actions";

/**
 * 드래그앤드롭 페이지 빌더.
 *
 * 지켜야 하는 것 하나:
 *   캔버스에 그려지는 블록은 공개 사이트와 "같은 컴포넌트"다.
 *   선택 테두리, 드래그 손잡이, 삭제 버튼은 전부 이 파일의 래퍼가 그린다.
 *   블록 컴포넌트 안에는 편집 관련 코드가 한 줄도 없다.
 *
 * 데이터도 마찬가지다. 미리보기 데이터는 서버 액션이 공개 사이트와 같은 loader
 * 로 만들어 돌려준다. 그래서 편집 화면과 실제 홈페이지가 갈라지지 않는다.
 */

type Props = {
  pageId: string;
  pageTitle: string;
  initialLayout: BlockInstance[];
  site: SiteSummary;
  boards: BoardOption[];
  /** 화면에 표시할 접속자 정보. */
  viewer: { name: string; role: string };
  /**
   * 공개 권한 보유 여부.
   *
   * 이 값으로 버튼을 감추는 것은 편의일 뿐 보안 장치가 아니다.
   * 실제 차단은 서버 액션의 requireCapability 가 한다.
   * 클라이언트에서 감추기만 하면 액션을 직접 호출하는 요청을 막지 못한다.
   */
  canPublish: boolean;
};

type SaveState =
  | { kind: "idle" }
  | { kind: "working"; label: string }
  | { kind: "done"; label: string }
  | { kind: "error"; message: string };

export function Builder({
  pageId,
  pageTitle,
  initialLayout,
  site,
  boards,
  viewer,
  canPublish,
}: Props) {
  const [blocks, setBlocks] = useState<BlockInstance[]>(initialLayout);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialLayout[0]?.id ?? null,
  );
  const [previewData, setPreviewData] = useState<Record<string, unknown>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>({ kind: "idle" });
  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    // 클릭과 드래그를 구분한다. 8px 이동해야 드래그로 본다.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // ---------------------------------------------------------------- 미리보기

  // 블록이 바뀔 때마다 서버에서 데이터를 다시 만든다.
  // 타이핑 한 글자마다 왕복하지 않도록 잠깐 모았다가 보낸다.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshPreview = useCallback((next: BlockInstance[]) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      const result = await loadPreviewData(next);
      if (result.ok) setPreviewData(result.data);
    }, 350);
  }, []);

  useEffect(() => {
    refreshPreview(blocks);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [blocks, refreshPreview]);

  // ---------------------------------------------------------------- 편집

  function addBlock(type: string, atIndex?: number) {
    const instance = createBlockInstance(type);
    setBlocks((current) => {
      const next = [...current];
      next.splice(atIndex ?? next.length, 0, instance);
      return next;
    });
    setSelectedId(instance.id);
    setSaveState({ kind: "idle" });
  }

  function removeBlock(id: string) {
    setBlocks((current) => current.filter((block) => block.id !== id));
    setSelectedId((current) => (current === id ? null : current));
    setSaveState({ kind: "idle" });
  }

  function updateProps(id: string, props: Record<string, unknown>) {
    setBlocks((current) =>
      current.map((block) => (block.id === id ? { ...block, props } : block)),
    );
    setSaveState({ kind: "idle" });
  }

  function handleDragStart(event: DragStartEvent) {
    setDragging(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = String(active.id);
    const overId = String(over.id);

    // 왼쪽 라이브러리에서 캔버스로 끌어다 놓은 경우
    if (activeId.startsWith("library:")) {
      const type = activeId.slice("library:".length);
      const overIndex = blocks.findIndex((block) => block.id === overId);
      addBlock(type, overIndex === -1 ? undefined : overIndex);
      return;
    }

    // 캔버스 안에서 순서를 바꾼 경우
    if (activeId === overId) return;
    const from = blocks.findIndex((block) => block.id === activeId);
    const to = blocks.findIndex((block) => block.id === overId);
    if (from === -1 || to === -1) return;

    setBlocks((current) => arrayMove(current, from, to));
    setSaveState({ kind: "idle" });
  }

  // ---------------------------------------------------------------- 저장

  function handleSave() {
    startTransition(async () => {
      setSaveState({ kind: "working", label: "저장 중" });
      const result = await saveDraft(pageId, blocks);
      setSaveState(
        result.ok
          ? { kind: "done", label: "임시저장했습니다" }
          : { kind: "error", message: result.error },
      );
    });
  }

  function handlePublish() {
    startTransition(async () => {
      setSaveState({ kind: "working", label: "공개 중" });
      const result = await publishPage(pageId, blocks);
      setSaveState(
        result.ok
          ? { kind: "done", label: `공개했습니다 (버전 ${result.data.revision})` }
          : { kind: "error", message: result.error },
      );
    });
  }

  function handleRequestReview() {
    startTransition(async () => {
      setSaveState({ kind: "working", label: "승인 요청 중" });
      const result = await requestReview(pageId, blocks);
      setSaveState(
        result.ok
          ? { kind: "done", label: "승인을 요청했습니다" }
          : { kind: "error", message: result.error },
      );
    });
  }

  const selected = blocks.find((block) => block.id === selectedId) ?? null;
  const selectedDefinition = selected ? getBlockDefinition(selected.type) : null;

  return (
    <DndContext
      // id 를 고정하지 않으면 dnd-kit 이 서버와 클라이언트에서 서로 다른
      // aria-describedby 를 만들어 하이드레이션 불일치가 난다.
      id="page-builder"
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-screen flex-col bg-surface-muted">
        <TopBar
          pageTitle={pageTitle}
          siteName={site.name}
          viewer={viewer}
          canPublish={canPublish}
          saveState={saveState}
          busy={isPending}
          onSave={handleSave}
          onPublish={handlePublish}
          onRequestReview={handleRequestReview}
        />

        <div className="flex min-h-0 flex-1">
          <LibraryPanel onAdd={(type) => addBlock(type)} />

          <Canvas
            blocks={blocks}
            previewData={previewData}
            site={site}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onRemove={removeBlock}
          />

          <aside
            aria-label="블록 설정"
            className="w-[32rem] shrink-0 overflow-y-auto border-l border-line bg-surface p-5"
          >
            {selected && selectedDefinition ? (
              <SettingsPanel
                definition={selectedDefinition}
                values={selected.props as Record<string, unknown>}
                boards={boards}
                onChange={(next) => updateProps(selected.id, next)}
              />
            ) : (
              <p className="text-[1.4rem] text-subtle">
                블록을 선택하면 설정을 바꿀 수 있습니다.
              </p>
            )}
          </aside>
        </div>
      </div>

      <DragOverlay>
        {dragging ? (
          <div className="rounded-krds-md border-2 border-line-brand bg-surface px-4 py-3 text-[1.4rem] font-bold text-brand shadow-lg">
            {dragging.startsWith("library:")
              ? (getBlockDefinition(dragging.slice(8))?.label ?? "블록")
              : (getBlockDefinition(
                  blocks.find((b) => b.id === dragging)?.type ?? "",
                )?.label ?? "블록")}
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

// ---------------------------------------------------------------- 상단 바

const ROLE_LABEL: Record<string, string> = {
  OWNER: "최고관리자",
  ADMIN: "관리자",
  APPROVER: "승인자",
  EDITOR: "편집자",
};

function TopBar({
  pageTitle,
  siteName,
  viewer,
  canPublish,
  saveState,
  busy,
  onSave,
  onPublish,
  onRequestReview,
}: {
  pageTitle: string;
  siteName: string;
  viewer: { name: string; role: string };
  canPublish: boolean;
  saveState: SaveState;
  busy: boolean;
  onSave: () => void;
  onPublish: () => void;
  onRequestReview: () => void;
}) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4 border-b border-line bg-surface px-5 py-3">
      <div>
        <p className="text-[1.2rem] text-subtle">{siteName}</p>
        <h1 className="text-[1.7rem] font-bold text-bolder">{pageTitle}</h1>
      </div>

      <div className="flex items-center gap-3">
        <p className="text-[1.3rem] text-subtle">
          {viewer.name}
          <span className="ml-1 rounded-krds-sm bg-surface-subtle px-2 py-1 text-[1.2rem]">
            {ROLE_LABEL[viewer.role] ?? viewer.role}
          </span>
        </p>
        <form action={signOutAction}>
          <button
            type="submit"
            className="text-[1.3rem] text-subtle underline underline-offset-4"
          >
            로그아웃
          </button>
        </form>
        {/* 저장 결과는 스크린리더에도 전달되어야 한다. */}
        <p
          role="status"
          aria-live="polite"
          className={[
            "text-[1.3rem]",
            saveState.kind === "error" ? "text-danger" : "text-subtle",
          ].join(" ")}
        >
          {saveState.kind === "working"
            ? saveState.label
            : saveState.kind === "done"
              ? saveState.label
              : saveState.kind === "error"
                ? saveState.message
                : ""}
        </p>

        <button
          type="button"
          onClick={onSave}
          disabled={busy}
          className="rounded-krds-sm border border-line px-4 py-2 text-[1.4rem] text-basic hover:bg-surface-subtle disabled:opacity-50"
        >
          임시저장
        </button>
        {/*
          공개 권한이 없는 편집자에게는 "공개하기" 대신 "승인 요청"을 보여준다.
          누를 수 없는 단추를 띄워 두고 눌렀을 때 거절하는 것보다,
          할 수 있는 일을 제시하는 편이 낫다.
        */}
        {canPublish ? (
          <button
            type="button"
            onClick={onPublish}
            disabled={busy}
            className="rounded-krds-sm bg-[var(--krds-action-secondary-active)] px-4 py-2 text-[1.4rem] font-bold text-[var(--krds-text-disabled-on)] disabled:opacity-50"
          >
            공개하기
          </button>
        ) : (
          <button
            type="button"
            onClick={onRequestReview}
            disabled={busy}
            className="rounded-krds-sm bg-[var(--krds-action-secondary-active)] px-4 py-2 text-[1.4rem] font-bold text-[var(--krds-text-disabled-on)] disabled:opacity-50"
          >
            승인 요청
          </button>
        )}
      </div>
    </header>
  );
}

// ---------------------------------------------------------------- 블록 라이브러리

function LibraryPanel({ onAdd }: { onAdd: (type: string) => void }) {
  return (
    <nav
      aria-label="블록 라이브러리"
      className="w-[24rem] shrink-0 overflow-y-auto border-r border-line bg-surface p-4"
    >
      <h2 className="mb-3 text-[1.5rem] font-bold text-bolder">블록</h2>
      <p className="mb-4 text-[1.3rem] text-subtle">
        끌어다 놓거나, 추가 단추를 누르세요.
      </p>
      <ul className="flex flex-col gap-2">
        {blockLibrary.map((definition) => (
          <li key={definition.type}>
            <LibraryItem
              type={definition.type}
              label={definition.label}
              description={definition.description}
              onAdd={onAdd}
            />
          </li>
        ))}
      </ul>
    </nav>
  );
}

function LibraryItem({
  type,
  label,
  description,
  onAdd,
}: {
  type: string;
  label: string;
  description: string;
  onAdd: (type: string) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `library:${type}`,
  });

  return (
    <div
      ref={setNodeRef}
      className={[
        "rounded-krds-md border border-line bg-surface-subtle p-3",
        isDragging ? "opacity-40" : "",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[1.4rem] font-bold text-basic">{label}</p>
          <p className="mt-1 text-[1.2rem] leading-snug text-subtle">
            {description}
          </p>
        </div>
        {/*
          마우스로 끌어다 놓는 손잡이.
          dnd-kit 의 attributes 는 tabIndex=0 과 role="button" 을 붙이는데,
          여기서는 아래 "추가" 단추가 키보드 경로를 담당하므로 이 손잡이는
          보조기기와 탭 순서에서 완전히 빼야 한다.
          aria-hidden 인 요소에 포커스가 가면 스크린리더 사용자는 아무 설명 없는
          지점에 갇힌다. 그래서 spread 뒤에 명시적으로 덮어쓴다.
        */}
        <span
          {...listeners}
          {...attributes}
          tabIndex={-1}
          role="presentation"
          aria-hidden="true"
          className="cursor-grab rounded-krds-sm px-2 py-1 text-subtle"
        >
          ⠿
        </span>
      </div>
      {/*
        키보드 사용자를 위한 경로. 드래그만 제공하면 접근성 기준을 통과할 수 없다.
        마우스 사용자에게도 이쪽이 더 빠른 경우가 많다.
      */}
      <button
        type="button"
        onClick={() => onAdd(type)}
        className="mt-2 w-full rounded-krds-sm border border-line bg-surface px-2 py-1 text-[1.3rem] text-brand"
      >
        {label} 추가
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- 캔버스

function Canvas({
  blocks,
  previewData,
  site,
  selectedId,
  onSelect,
  onRemove,
}: {
  blocks: BlockInstance[];
  previewData: Record<string, unknown>;
  site: SiteSummary;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  const { setNodeRef } = useDroppable({ id: "canvas" });

  return (
    <main
      ref={setNodeRef}
      aria-label="페이지 미리보기"
      className="min-w-0 flex-1 overflow-y-auto bg-surface-muted p-6"
    >
      <div className="mx-auto max-w-[110rem] overflow-hidden rounded-krds-lg border border-line bg-surface">
        {blocks.length === 0 ? (
          <p className="px-6 py-24 text-center text-[1.5rem] text-subtle">
            왼쪽에서 블록을 끌어다 놓아 페이지를 만드세요.
          </p>
        ) : (
          <SortableContext
            items={blocks.map((block) => block.id)}
            strategy={verticalListSortingStrategy}
          >
            {blocks.map((block) => (
              <SortableBlock
                key={block.id}
                block={block}
                data={previewData[block.id]}
                site={site}
                selected={block.id === selectedId}
                onSelect={() => onSelect(block.id)}
                onRemove={() => onRemove(block.id)}
              />
            ))}
          </SortableContext>
        )}
      </div>
    </main>
  );
}

function SortableBlock({
  block,
  data,
  site,
  selected,
  onSelect,
  onRemove,
}: {
  block: BlockInstance;
  data: unknown;
  site: SiteSummary;
  selected: boolean;
  onSelect: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: block.id });

  const definition = getBlockDefinition(block.type);

  if (!definition) {
    return (
      <div className="border-b border-line bg-surface-subtle px-6 py-8 text-[1.4rem] text-danger">
        알 수 없는 블록입니다: {block.type}
        <button type="button" onClick={onRemove} className="ml-3 underline">
          삭제
        </button>
      </div>
    );
  }

  const { Component } = definition;

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={[
        "relative border-b border-line",
        isDragging ? "opacity-50" : "",
        selected ? "outline-2 -outline-offset-2 outline-[var(--krds-border-primary)]" : "",
      ].join(" ")}
    >
      {/*
        편집 도구는 전부 이 래퍼가 그린다.
        아래 <Component> 는 공개 사이트에서 쓰는 것과 완전히 같은 컴포넌트다.
      */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={`${definition.label} 순서 바꾸기`}
          className="cursor-grab rounded-krds-sm border border-line bg-surface px-2 py-1 text-[1.3rem] text-subtle"
        >
          ⠿
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${definition.label} 삭제`}
          className="rounded-krds-sm border border-line bg-surface px-2 py-1 text-[1.3rem] text-danger"
        >
          삭제
        </button>
      </div>

      {/*
        블록 전체를 클릭하면 선택된다.
        블록 안의 링크가 눌리지 않도록 포인터 이벤트를 덮개가 가로챈다.
      */}
      <button
        type="button"
        onClick={onSelect}
        aria-label={`${definition.label} 선택`}
        aria-pressed={selected}
        className="absolute inset-0 z-[5] h-full w-full cursor-pointer bg-transparent"
      />

      <div className="pointer-events-none">
        <Component
          props={block.props}
          data={data ?? definition.emptyData}
          mode="preview"
          site={site}
        />
      </div>
    </div>
  );
}
