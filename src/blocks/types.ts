import type { ComponentType } from "react";
import type { z } from "zod";

/**
 * 블록 계약.
 *
 * 이 프로젝트에서 가장 중요한 제약이 여기에 있다:
 *
 *   블록 컴포넌트는 Builder Preview 와 Public Renderer 에서
 *   "같은 파일, 같은 코드"로 렌더링되어야 한다.
 *
 * 편집기에서 본 화면과 실제 공개된 학교 홈페이지가 다르면 제품 신뢰가 무너지므로,
 * 블록 컴포넌트에는 편집 전용 코드를 한 줄도 넣지 않는다.
 * 선택 하이라이트, 드래그 핸들, 리사이즈 같은 편집 UI 는 전부 바깥 래퍼가 담당한다.
 *
 * 그 결과 블록 컴포넌트에는 다음 규칙이 걸린다.
 *
 *   1. "use client" / "use server" 를 붙이지 않는다.
 *      지시어가 없어야 서버 트리와 클라이언트 트리 양쪽에서 쓸 수 있다.
 *   2. 데이터를 직접 가져오지 않는다. prisma, fetch, cookies() 모두 금지.
 *      필요한 데이터는 loader 가 만들어 data prop 으로 넘긴다.
 *   3. 상태를 갖지 않는다. props 와 data 만으로 결정되는 순수 함수여야 한다.
 *      (캐러셀처럼 상태가 꼭 필요하면 그 부분만 별도 client 컴포넌트로 분리한다.)
 *   4. 이 파일(블록 모듈) 전체가 값(value) 단위로 서버 전용 모듈을 import 하지
 *      않는다. loader 도 마찬가지다. 아래 BlockDataSource 를 통해서만 데이터를
 *      읽는다.
 *
 * 4번이 왜 필요한가:
 *   빌더는 클라이언트 컴포넌트이고 registry 를 통해 모든 블록을 import 한다.
 *   블록이 prisma 를 쓰는 모듈을 하나라도 import 하면 그 순간 DB 드라이버가
 *   브라우저 번들로 끌려 들어가 빌드가 깨진다.
 *   실제로 그렇게 깨졌고, 그래서 데이터 접근을 주입 방식으로 바꿨다.
 */

// ---------------------------------------------------------------- 데이터 접근

/** 게시판 글 목록의 최소 형태. 블록이 필요로 하는 필드만 노출한다. */
export type PostSummary = {
  id: string;
  title: string;
  pinned: boolean;
  publishedAt: Date | null;
};

export type GallerySummary = {
  id: string;
  title: string;
  publishedAt: Date | null;
  /** 승인된 이미지 첨부 1장. 없으면 null. */
  image: { id: string; filename: string } | null;
};

/** 게시물을 어느 시간 구간에서 가져올지. 자세한 설명은 src/lib/tenant.ts 참고. */
export type PostWindow = "released" | "upcoming" | "throughToday";

/**
 * 블록이 데이터를 읽는 유일한 통로.
 *
 * 구현은 서버(src/lib/tenant.ts)가 제공하고, 렌더러가 loader 에 주입한다.
 * 블록은 이 인터페이스의 "타입"만 알고 있으므로 서버 코드가 딸려오지 않는다.
 * 테넌트 경계는 구현체가 이미 닫아 두었으므로, 블록은 siteId 를 볼 수 없고
 * 볼 필요도 없다.
 */
export type BlockDataSource = {
  boardPosts(
    boardSlug: string,
    limit: number,
    window?: PostWindow,
  ): Promise<PostSummary[]>;
  galleryItems(boardSlug: string, limit: number): Promise<GallerySummary[]>;
};

export type BlockRenderMode = "public" | "preview";

/** 블록이 사이트 전역 정보를 참조할 때 쓰는 최소 정보. */
export type SiteSummary = {
  id: string;
  name: string;
  slug: string;
  organizationName: string;
};

export type BlockRenderProps<TProps, TData = undefined> = {
  props: TProps;
  data: TData;
  /** public = 실제 공개 사이트, preview = 빌더 캔버스. 렌더 결과를 바꾸는 데 쓰지 않는다. */
  mode: BlockRenderMode;
  site: SiteSummary;
};

// ---------------------------------------------------------------- 설정 패널

/**
 * 설정 패널은 이 선언에서 자동 생성한다.
 * 블록을 추가할 때 폼 UI 를 새로 짜지 않게 하려는 것이고,
 * 동시에 "사용자가 만질 수 있는 값"의 화이트리스트 역할을 한다.
 */
export type SettingsField =
  | { kind: "text"; name: string; label: string; help?: string; maxLength?: number }
  | { kind: "textarea"; name: string; label: string; help?: string; maxLength?: number }
  | { kind: "number"; name: string; label: string; help?: string; min: number; max: number }
  | { kind: "boolean"; name: string; label: string; help?: string }
  | {
      kind: "select";
      name: string;
      label: string;
      help?: string;
      options: ReadonlyArray<{ value: string; label: string }>;
    }
  /** 사이트에 있는 게시판 중 하나를 고른다. 값은 Board.slug. */
  | { kind: "board"; name: string; label: string; help?: string }
  /** 승인된 Asset 중 하나를 고른다. 값은 Asset.id. */
  | { kind: "image"; name: string; label: string; help?: string }
  /** 제목 + 링크 쌍의 목록. */
  | { kind: "linkList"; name: string; label: string; help?: string; maxItems: number };

// ---------------------------------------------------------------- 블록 정의

export type BlockCategory = "머리말" | "콘텐츠" | "안내";

export type BlockDefinition<TProps, TData = undefined> = {
  /** Page JSON 에 저장되는 식별자. 한 번 정하면 바꾸지 않는다. */
  type: string;
  label: string;
  description: string;
  category: BlockCategory;

  /** props 검증. 서버에서 저장 전에 반드시 통과시킨다. */
  schema: z.ZodType<TProps>;
  /** 블록을 새로 추가했을 때의 초기값. */
  defaults: TProps;
  settings: ReadonlyArray<SettingsField>;

  /**
   * 데이터가 필요한 블록만 정의한다.
   * Public Renderer 와 빌더 미리보기가 같은 loader 를 호출하므로,
   * 두 화면의 데이터 출처가 갈라지지 않는다.
   *
   * source 는 렌더러가 테넌트 컨텍스트를 닫아서 넘겨준다.
   * loader 안에서 prisma 나 fetch 를 직접 쓰지 않는다.
   */
  loader?: (args: {
    props: TProps;
    source: BlockDataSource;
  }) => Promise<TData>;
  /** loader 가 실패하거나 아직 데이터가 없을 때 쓸 값. */
  emptyData: TData;

  Component: ComponentType<BlockRenderProps<TProps, TData>>;
};

/** 타입 추론을 위한 헬퍼. 블록 정의는 전부 이 함수를 통해 만든다. */
export function defineBlock<TProps, TData = undefined>(
  definition: BlockDefinition<TProps, TData>,
): BlockDefinition<TProps, TData> {
  return definition;
}

/** 타입 파라미터를 지운 형태. 레지스트리에 담을 때 쓴다. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyBlockDefinition = BlockDefinition<any, any>;
