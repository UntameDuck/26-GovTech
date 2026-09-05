import type { AnyBlockDefinition } from "@/blocks/types";

import { heroBlock } from "@/blocks/hero";
import { quickLinksBlock } from "@/blocks/quick-links";
import { noticeBoardBlock } from "@/blocks/notice-board";
import { galleryBlock } from "@/blocks/gallery";
import { calendarBlock } from "@/blocks/calendar";
import { mealBlock } from "@/blocks/meal";

/**
 * Block Registry.
 *
 * 이 목록이 곧 "학교가 만들 수 있는 것"의 전부다.
 * 임의 HTML / CSS / JavaScript / 플러그인을 허용하지 않는다는 원칙이
 * 이 파일 하나로 구현된다. 여기에 없는 type 은 저장되지도, 렌더링되지도 않는다.
 *
 * 블록을 추가하려면 src/blocks/<이름>/index.tsx 를 만들고 여기에 등록한다.
 * type 문자열은 Page JSON 에 그대로 저장되므로 한 번 정하면 바꾸지 않는다.
 */
const definitions = [
  heroBlock,
  quickLinksBlock,
  noticeBoardBlock,
  galleryBlock,
  calendarBlock,
  mealBlock,
] as const satisfies ReadonlyArray<AnyBlockDefinition>;

export const blockRegistry: ReadonlyMap<string, AnyBlockDefinition> = new Map(
  definitions.map((definition) => [definition.type, definition]),
);

/** 빌더 왼쪽 패널에 그대로 쓸 수 있는 목록. */
export const blockLibrary: ReadonlyArray<AnyBlockDefinition> = definitions;

export function getBlockDefinition(type: string): AnyBlockDefinition | null {
  return blockRegistry.get(type) ?? null;
}

export function isKnownBlockType(type: string): boolean {
  return blockRegistry.has(type);
}

export type BlockType = (typeof definitions)[number]["type"];
