import "server-only";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";

/**
 * 감사로그.
 *
 * 아키텍처 문서 03 의 "최소 기록 대상"을 담는다.
 *   로그인 성공/실패, 권한 변경, 사용자 초대/삭제, 페이지 편집,
 *   Publish/Rollback, 게시글 생성/삭제, 파일 업로드/삭제,
 *   Migration, 민감 데이터 export, 보안 설정 변경
 *
 * 두 가지를 지킨다.
 *
 *  1. detail 에 개인정보를 넣지 않는다. 이메일은 로그인 실패 추적에 필요한
 *     최소한으로만 남기고, 비밀번호나 토큰은 어떤 형태로도 넣지 않는다.
 *  2. 감사 기록 실패가 본래 작업을 막지 않는다. 로그를 못 남겼다고 로그인이
 *     실패하면 가용성 문제가 된다. 대신 서버 로그에 크게 남긴다.
 */

export type AuditInput = {
  action: string;
  actorId?: string | null;
  organizationId?: string | null;
  siteId?: string | null;
  resource?: string | null;
  result?: "SUCCESS" | "FAILURE";
  detail?: Record<string, unknown>;
};

/** 요청의 IP 와 User-Agent 를 뽑는다. 프록시 뒤를 고려한다. */
async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    // Ingress/프록시를 거치면 원 IP 는 X-Forwarded-For 첫 번째 항목에 있다.
    const forwarded = h.get("x-forwarded-for");
    const ip = forwarded
      ? (forwarded.split(",")[0]?.trim() ?? null)
      : h.get("x-real-ip");
    return { ip: ip || null, userAgent: h.get("user-agent") };
  } catch {
    // 요청 컨텍스트 밖(예: 백그라운드 작업)에서 호출된 경우.
    return { ip: null, userAgent: null };
  }
}

export async function recordAudit(input: AuditInput): Promise<void> {
  const { ip, userAgent } = await requestMeta();

  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        actorId: input.actorId ?? null,
        organizationId: input.organizationId ?? null,
        siteId: input.siteId ?? null,
        resource: input.resource ?? null,
        result: input.result ?? "SUCCESS",
        ip,
        userAgent: userAgent?.slice(0, 500) ?? null,
        detail: (input.detail ?? {}) as object,
      },
    });
  } catch (error) {
    // 기록 실패가 본래 동작을 막지 않게 한다.
    console.error("[audit] 감사로그 기록 실패", input.action, error);
  }
}

/**
 * 로그인 시도 기록.
 *
 * 실패한 이메일을 남기는 것은 무차별 대입 탐지에 필요하다.
 * 다만 비밀번호는 어떤 경우에도 남기지 않으며, reason 은 고정된 코드만 쓴다.
 */
export async function recordAuthAttempt(args: {
  action: "LOGIN_SUCCESS" | "LOGIN_FAILURE";
  userId?: string;
  email: string;
  reason?: "UNKNOWN_ACCOUNT" | "BAD_PASSWORD";
}): Promise<void> {
  await recordAudit({
    action: args.action,
    actorId: args.userId ?? null,
    result: args.action === "LOGIN_SUCCESS" ? "SUCCESS" : "FAILURE",
    resource: `User:${args.email}`,
    detail: args.reason ? { reason: args.reason } : {},
  });
}
