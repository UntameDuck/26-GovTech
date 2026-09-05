import Link from "next/link";

/**
 * 공개 사이트에 그대로 노출되는 화면이므로 한국어로 제공한다.
 * Next.js 기본 404 는 영문이고, 학교 홈페이지에서 그대로 보이면 안 된다.
 */
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-[70rem] flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <p className="text-[1.4rem] font-bold text-subtle">404</p>
      <h1 className="text-[2.8rem] font-bold text-bolder">
        요청하신 페이지를 찾을 수 없습니다
      </h1>
      <p className="text-[1.6rem] text-subtle">
        주소가 바뀌었거나 삭제된 페이지일 수 있습니다.
      </p>
      <Link
        href="/"
        className="mt-4 rounded-krds-sm border border-line px-6 py-3 text-[1.5rem] text-basic no-underline hover:bg-surface-subtle"
      >
        홈으로 가기
      </Link>
    </div>
  );
}
