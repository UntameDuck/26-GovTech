import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolvePublicSiteByHost, findSite } from "@/lib/tenant";

/*
 * 참고: 이 레이아웃의 고정 메뉴는 next/link 를 쓰지만,
 * 블록(src/blocks/*) 안의 링크는 의도적으로 <a> 를 유지한다.
 * 블록의 href 는 학교가 설정한 값이라 외부 주소일 수 있고,
 * 홈페이지에 깔린 링크를 전부 프리페치하면 낭비가 크기 때문이다.
 */

/**
 * 공개 학교 홈페이지의 공통 뼈대.
 *
 * 학교마다 애플리케이션을 따로 배포하지 않는다.
 * 하나의 Renderer 가 Host 헤더로 사이트를 구분해 여러 학교를 처리한다.
 */
export default async function PublicLayout({
  children,
}: {
  children: ReactNode;
}) {
  const host = (await headers()).get("host") ?? "";
  const ctx = await resolvePublicSiteByHost(host);
  if (!ctx) notFound();

  const site = await findSite(ctx);

  return (
    <>
      {/* 키보드 사용자가 반복되는 머리말을 건너뛰게 한다 (KWCAG 2.2). */}
      <a
        href="#main-content"
        className="sr-only-krds focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-krds-sm focus:bg-surface focus:px-4 focus:py-2 focus:text-brand"
      >
        본문 바로가기
      </a>

      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[120rem] items-center justify-between gap-4 px-6 py-4">
          <Link
            href="/"
            className="text-[1.8rem] font-bold text-bolder no-underline"
          >
            {site.name}
          </Link>
          <nav aria-label="주요 메뉴">
            <ul className="flex gap-5 text-[1.5rem]">
              <li>
                <Link href="/notice" className="text-basic no-underline hover:underline">
                  공지사항
                </Link>
              </li>
              <li>
                <Link href="/letters" className="text-basic no-underline hover:underline">
                  가정통신문
                </Link>
              </li>
              <li>
                <Link href="/calendar" className="text-basic no-underline hover:underline">
                  학사일정
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </header>

      <main id="main-content" className="flex-1">
        {children}
      </main>

      <footer className="mt-auto border-t border-line bg-surface-subtle">
        <div className="mx-auto w-full max-w-[120rem] px-6 py-10 text-[1.4rem] text-subtle">
          <p className="font-bold text-basic">{site.organization.name}</p>
          <p className="mt-2">
            이 사이트는 AUREUM 공공 웹사이트 플랫폼으로 운영됩니다.
          </p>
        </div>
      </footer>
    </>
  );
}
