import type { ReactNode } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/(admin)/admin/actions";

/**
 * 관리 화면의 공통 뼈대.
 *
 * 빌더(/admin)는 캔버스를 최대한 넓게 써야 해서 전체 화면을 직접 구성한다.
 * 그 외 관리 화면(게시판 등)은 이 껍데기를 쓴다.
 */

const ROLE_LABEL: Record<string, string> = {
  OWNER: "최고관리자",
  ADMIN: "관리자",
  APPROVER: "승인자",
  EDITOR: "편집자",
};

export function AdminShell({
  siteName,
  viewer,
  breadcrumb,
  children,
}: {
  siteName: string;
  viewer: { name: string; role: string };
  breadcrumb: Array<{ label: string; href?: string }>;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-surface-muted">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[110rem] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-6">
            <Link
              href="/admin"
              className="text-[1.6rem] font-bold text-bolder no-underline"
            >
              {siteName}
            </Link>
            <nav aria-label="관리 메뉴">
              <ul className="flex gap-4 text-[1.4rem]">
                <li>
                  <Link
                    href="/admin"
                    className="text-basic no-underline hover:underline"
                  >
                    페이지 편집
                  </Link>
                </li>
                <li>
                  <Link
                    href="/admin/boards"
                    className="text-basic no-underline hover:underline"
                  >
                    게시판
                  </Link>
                </li>
                <li>
                  <a
                    href="/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-basic no-underline hover:underline"
                  >
                    공개 사이트
                    <span className="sr-only-krds"> (새 창에서 열림)</span>
                  </a>
                </li>
              </ul>
            </nav>
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
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[110rem] flex-1 px-6 py-8">
        <nav aria-label="현재 위치" className="mb-5 text-[1.3rem] text-subtle">
          {breadcrumb.map((item, index) => (
            <span key={`${item.label}-${index}`}>
              {index > 0 ? <span aria-hidden="true"> › </span> : null}
              {item.href ? (
                <Link
                  href={item.href}
                  className="text-subtle no-underline hover:underline"
                >
                  {item.label}
                </Link>
              ) : (
                <span aria-current="page">{item.label}</span>
              )}
            </span>
          ))}
        </nav>

        {children}
      </main>
    </div>
  );
}
