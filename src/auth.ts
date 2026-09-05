import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/db";
import { verifyPassword, fakeVerifyForTiming } from "@/lib/password";
import { recordAuthAttempt } from "@/lib/audit";

/**
 * Auth.js v5 설정.
 *
 * 지금은 이메일/비밀번호(Credentials)만 지원한다.
 * 아키텍처 문서 03 은 향후 OIDC/SAML SSO 와 MFA(TOTP/WebAuthn)를 예정하고 있고,
 * 문서 05 는 MFA 를 P1 로 두었다. 그래서 지금 MFA 를 구현하지는 않되,
 * User 모델에 mfaEnabled/mfaSecret 을 미리 두고 여기 authorize 뒤에
 * 2단계를 끼울 수 있는 형태로 남겨 둔다.
 */

const credentialsSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "이메일", type: "email" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const { email, password } = parsed.data;
        const normalizedEmail = email.trim().toLowerCase();

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          select: {
            id: true,
            email: true,
            name: true,
            passwordHash: true,
            mfaEnabled: true,
          },
        });

        if (!user) {
          // 계정이 없어도 해싱과 비슷한 시간을 쓴다.
          // 응답 시간 차이로 가입 여부를 알아내는 사용자 열거를 막는다.
          await fakeVerifyForTiming(password);
          await recordAuthAttempt({
            action: "LOGIN_FAILURE",
            email: normalizedEmail,
            reason: "UNKNOWN_ACCOUNT",
          });
          return null;
        }

        const valid = await verifyPassword(password, user.passwordHash);
        if (!valid) {
          await recordAuthAttempt({
            action: "LOGIN_FAILURE",
            userId: user.id,
            email: normalizedEmail,
            reason: "BAD_PASSWORD",
          });
          return null;
        }

        // TODO(P1): user.mfaEnabled 가 true 면 여기서 TOTP 2단계로 넘긴다.
        // 문서 03 은 OWNER/ADMIN/GROUP_ADMIN 에 MFA 필수를 목표로 한다.

        await recordAuthAttempt({
          action: "LOGIN_SUCCESS",
          userId: user.id,
          email: normalizedEmail,
        });

        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
});
