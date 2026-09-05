"use client";

import { useId } from "react";
import type { AnyBlockDefinition, SettingsField } from "@/blocks/types";

/**
 * 설정 패널.
 *
 * 블록마다 폼을 새로 짜지 않는다. 블록 정의의 settings 선언을 읽어 폼을 만든다.
 * 블록을 추가할 때 개발자가 잊고 폼을 안 만드는 일이 생기지 않고,
 * 동시에 "사용자가 만질 수 있는 값"의 화이트리스트가 한 곳에 모인다.
 *
 * 여기 없는 필드는 편집할 수 없다. 그것이 임의 HTML/CSS 를 막는 방식이다.
 */

export type BoardOption = { slug: string; name: string };

type Props = {
  definition: AnyBlockDefinition;
  values: Record<string, unknown>;
  boards: BoardOption[];
  onChange: (next: Record<string, unknown>) => void;
};

export function SettingsPanel({ definition, values, boards, onChange }: Props) {
  function setField(name: string, value: unknown) {
    onChange({ ...values, [name]: value });
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-[1.6rem] font-bold text-bolder">
          {definition.label}
        </h2>
        <p className="mt-1 text-[1.3rem] text-subtle">{definition.description}</p>
      </div>

      {definition.settings.map((field) => (
        <Field
          key={field.name}
          field={field}
          value={values[field.name]}
          boards={boards}
          onChange={(value) => setField(field.name, value)}
        />
      ))}
    </div>
  );
}

function Field({
  field,
  value,
  boards,
  onChange,
}: {
  field: SettingsField;
  value: unknown;
  boards: BoardOption[];
  onChange: (value: unknown) => void;
}) {
  const id = useId();
  const helpId = `${id}-help`;
  const describedBy = "help" in field && field.help ? helpId : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[1.4rem] font-bold text-basic">
        {field.label}
      </label>

      {field.kind === "text" ? (
        <input
          id={id}
          type="text"
          value={String(value ?? "")}
          maxLength={field.maxLength}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      ) : null}

      {field.kind === "textarea" ? (
        <textarea
          id={id}
          rows={4}
          value={String(value ?? "")}
          maxLength={field.maxLength}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        />
      ) : null}

      {field.kind === "number" ? (
        <input
          id={id}
          type="number"
          value={Number(value ?? field.min)}
          min={field.min}
          max={field.max}
          aria-describedby={describedBy}
          onChange={(event) => {
            const parsed = Number(event.target.value);
            if (Number.isNaN(parsed)) return;
            // 범위를 벗어난 값이 저장 단계까지 가지 않게 여기서 자른다.
            onChange(Math.min(Math.max(parsed, field.min), field.max));
          }}
          className={inputClass}
        />
      ) : null}

      {field.kind === "boolean" ? (
        <label className="flex items-center gap-2 text-[1.4rem] text-basic">
          <input
            id={id}
            type="checkbox"
            checked={Boolean(value)}
            aria-describedby={describedBy}
            onChange={(event) => onChange(event.target.checked)}
            className="h-4 w-4"
          />
          사용
        </label>
      ) : null}

      {field.kind === "select" ? (
        <select
          id={id}
          value={String(value ?? "")}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      ) : null}

      {field.kind === "board" ? (
        <select
          id={id}
          value={String(value ?? "")}
          aria-describedby={describedBy}
          onChange={(event) => onChange(event.target.value)}
          className={inputClass}
        >
          {boards.length === 0 ? (
            <option value="">게시판이 없습니다</option>
          ) : null}
          {boards.map((board) => (
            <option key={board.slug} value={board.slug}>
              {board.name}
            </option>
          ))}
        </select>
      ) : null}

      {field.kind === "image" ? (
        <p
          id={id}
          className="rounded-krds-sm border border-dashed border-line px-3 py-4 text-[1.3rem] text-subtle"
        >
          파일 업로드는 아직 준비 중입니다.
        </p>
      ) : null}

      {field.kind === "linkList" ? (
        <LinkListField
          value={value}
          maxItems={field.maxItems}
          onChange={onChange}
        />
      ) : null}

      {"help" in field && field.help ? (
        <p id={helpId} className="text-[1.3rem] text-subtle">
          {field.help}
        </p>
      ) : null}
    </div>
  );
}

type LinkItem = { label: string; href: string; description: string };

function LinkListField({
  value,
  maxItems,
  onChange,
}: {
  value: unknown;
  maxItems: number;
  onChange: (value: unknown) => void;
}) {
  const items: LinkItem[] = Array.isArray(value) ? (value as LinkItem[]) : [];

  function update(index: number, patch: Partial<LinkItem>) {
    const next = items.map((item, i) => (i === index ? { ...item, ...patch } : item));
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-krds-sm border border-line p-3"
        >
          <input
            type="text"
            value={item.label ?? ""}
            placeholder="표시할 이름"
            aria-label={`링크 ${index + 1} 이름`}
            onChange={(event) => update(index, { label: event.target.value })}
            className={inputClass}
          />
          <input
            type="text"
            value={item.href ?? ""}
            placeholder="/notice 또는 https://..."
            aria-label={`링크 ${index + 1} 주소`}
            onChange={(event) => update(index, { href: event.target.value })}
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
            className="self-start text-[1.3rem] text-danger underline"
          >
            이 링크 삭제
          </button>
        </div>
      ))}

      {items.length < maxItems ? (
        <button
          type="button"
          onClick={() =>
            onChange([...items, { label: "새 링크", href: "/", description: "" }])
          }
          className="rounded-krds-sm border border-line px-3 py-2 text-[1.4rem] text-basic hover:bg-surface-subtle"
        >
          링크 추가
        </button>
      ) : (
        <p className="text-[1.3rem] text-subtle">
          최대 {maxItems}개까지 넣을 수 있습니다.
        </p>
      )}
    </div>
  );
}

const inputClass =
  "w-full rounded-krds-sm border border-line bg-surface px-3 py-2 text-[1.4rem] text-basic";
