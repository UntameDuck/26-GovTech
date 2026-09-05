import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { signIn } from "@/auth";
import { getAdminSession } from "@/lib/session";

/**
 * 관리자 로그인.
 *
 * 실패 메시지는 "이메일 또는 비밀번호가 올바르지 않습니다" 하나로 통일한다.
 * 어느 쪽이 틀렸는지 알려 주면 가입 여부를 확인하는 수단이 된다
 * (아키텍처 문서 03 의 "에러 응답 최소화").
 */

export const dynamic = "force-dynamic";

const GENERIC_ERROR = "이메일 또는 비밀번호가 올바르지 않습니다.";

export default async function LoginPage({
  searchParams,
}: PageProps<"/login">) {
  const params = await searchParams;
  const nextPath = typeof params.next === "string" ? params.next : "/admin";
  const failed = params.error !== undefined;

  // 이미 로그인했으면 바로 보낸다.
  const session = await getAdminSession();
  if (session) redirect(safeNext(nextPath));

  async function authenticate(formData: FormData) {
    "use server";

    const target = safeNext(String(formData.get("next") ?? "/admin"));

    try {
      await signIn("credentials", {
        email: String(formData.get("email") ?? ""),
        password: String(formData.get("password") ?? ""),
        redirectTo: target,
      });
    } catch (error) {
      // signIn 은 성공 시 리다이렉트를 위해 예외를 던진다. 그것은 그대로 통과시킨다.
      if (error instanceof AuthError) {
        redirect(`/login?error=1&next=${encodeURIComponent(target)}`);
      }
      throw error;
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[42rem] flex-1 flex-col justify-center gap-6 px-6 py-20">
      <div>
        <p className="text-[1.3rem] font-bold text-brand">AUREUM</p>
        <h1 className="mt-1 text-[2.6rem] font-bold text-bolder">
          관리자 로그인
        </h1>
        <p className="mt-2 text-[1.5rem] text-subtle">
          학교 홈페이지를 관리하려면 로그인하세요.
        </p>
      </div>

      {failed ? (
        // role="alert" 로 스크린리더가 즉시 읽게 한다.
        <p
          role="alert"
          className="rounded-krds-sm border border-[var(--krds-border-danger)] bg-[var(--krds-surface-danger-subtler)] px-4 py-3 text-[1.4rem] text-danger"
        >
          {GENERIC_ERROR}
        </p>
      ) : null}

      <form action={authenticate} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={nextPath} />

        <div className="flex flex-col gap-2">
          <label htmlFor="email" className="text-[1.4rem] font-bold text-basic">
            이메일
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className="rounded-krds-sm border border-line bg-surface px-4 py-3 text-[1.5rem] text-basic"
          />
        </div>

        <div className="flex flex-col gap-2">
          <label
            htmlFor="password"
            className="text-[1.4rem] font-bold text-basic"
          >
            비밀번호
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            required
            className="rounded-krds-sm border border-line bg-surface px-4 py-3 text-[1.5rem] text-basic"
          />
        </div>

        <button
          type="submit"
          className="mt-2 rounded-krds-sm bg-[var(--krds-action-secondary-active)] px-5 py-3 text-[1.5rem] font-bold text-[var(--krds-text-disabled-on)]"
        >
          로그인
        </button>
      </form>

      <p className="text-[1.3rem] text-subtle">
        <Link href="/" className="text-brand underline underline-offset-4">
          학교 홈페이지로 돌아가기
        </Link>
      </p>
    </div>
  );
}

/**
 * 열린 리다이렉트 방지.
 *
 * next 파라미터를 그대로 믿으면 "//evil.example" 같은 값으로 외부 사이트에
 * 보낼 수 있다. 사이트 내부의 단일 슬래시 경로만 허용한다.
 */
function safeNext(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/admin";
  return value;
}
