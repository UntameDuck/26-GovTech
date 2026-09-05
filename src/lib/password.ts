// 여기에는 "server-only" 를 붙이지 않는다.
// prisma/seed.ts 같은 일반 Node 스크립트에서도 같은 해싱 함수를 써야 하고,
// server-only 는 그런 스크립트에서 import 되는 순간 예외를 던진다.
// 대신 node:crypto 에만 의존하므로 브라우저 번들에 섞이면 빌드가 즉시 깨진다.
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

/**
 * 비밀번호 해싱.
 *
 * Node 내장 scrypt 를 쓴다. bcrypt/argon2 같은 네이티브 모듈을 쓰지 않는 이유:
 *
 *  1. 목표 배포 환경이 OCI A1 (ARM64) 이고 개발 PC 는 amd64 다.
 *     네이티브 모듈은 멀티아치 이미지 빌드에서 가장 먼저 깨지는 부분이다.
 *  2. 아키텍처 문서 03 이 공급망(Supply Chain)을 보안 계층 L1 로 두고 있다.
 *     의존성을 늘리지 않는 것 자체가 그 정책에 부합한다.
 *
 * 파라미터는 OWASP Password Storage 권고를 따르되, 2 OCPU / 12GB 라는
 * 배포 환경에 맞춰 N=2^15(=32MB/회)로 잡았다. 하드웨어가 커지면 N 을 올리고,
 * 기존 해시는 저장된 파라미터로 계속 검증되므로 점진적 상향이 가능하다.
 */

// promisify 는 scrypt 의 options 오버로드를 잃어버리므로 시그니처를 명시한다.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

const PARAMS = {
  N: 32768, // 2^15
  r: 8,
  p: 1,
  keyLength: 64,
  saltLength: 16,
} as const;

/** scrypt 의 메모리 사용량은 128 * N * r 바이트다. 기본값 기준 약 32MB. */
const MAX_MEMORY = 192 * 1024 * 1024;

const FORMAT_VERSION = "scrypt$1";

/**
 * 저장 형식: scrypt$1$N$r$p$<salt-base64>$<hash-base64>
 * 파라미터를 함께 저장하기 때문에, 나중에 N 을 올려도 옛 해시를 검증할 수 있다.
 */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(PARAMS.saltLength);
  const derived = await scryptAsync(plain.normalize("NFKC"), salt, PARAMS.keyLength, {
    N: PARAMS.N,
    r: PARAMS.r,
    p: PARAMS.p,
    maxmem: MAX_MEMORY,
  });

  return [
    FORMAT_VERSION,
    PARAMS.N,
    PARAMS.r,
    PARAMS.p,
    salt.toString("base64"),
    derived.toString("base64"),
  ].join("$");
}

/**
 * 비밀번호 검증.
 *
 * 비교는 timingSafeEqual 로 한다. 문자열 === 비교는 앞에서부터 다른 지점에서
 * 즉시 끝나기 때문에, 응답 시간으로 해시를 한 바이트씩 알아낼 여지를 준다.
 */
export async function verifyPassword(
  plain: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;

  const parts = stored.split("$");
  // "scrypt", "1", N, r, p, salt, hash
  if (parts.length !== 7 || parts[0] !== "scrypt" || parts[1] !== "1") {
    return false;
  }

  const N = Number(parts[2]);
  const r = Number(parts[3]);
  const p = Number(parts[4]);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) {
    return false;
  }

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[5]!, "base64");
    expected = Buffer.from(parts[6]!, "base64");
  } catch {
    return false;
  }

  let derived: Buffer;
  try {
    derived = await scryptAsync(plain.normalize("NFKC"), salt, expected.length, {
      N,
      r,
      p,
      maxmem: MAX_MEMORY,
    });
  } catch {
    // 저장된 파라미터가 비정상이라 scrypt 가 거부한 경우.
    return false;
  }

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}

/**
 * 존재하지 않는 계정으로 로그인을 시도했을 때 호출한다.
 *
 * 계정이 없으면 즉시 실패를 돌려주고 싶어지지만, 그러면 응답 시간만으로
 * "이 이메일은 가입되어 있다"를 알아낼 수 있다(사용자 열거).
 * 실제 해시가 있을 때와 비슷한 시간을 쓰도록 더미 검증을 수행한다.
 */
export async function fakeVerifyForTiming(plain: string): Promise<void> {
  await verifyPassword(plain, DUMMY_HASH);
}

/**
 * 위 목적의 고정 더미 해시. 어떤 비밀번호와도 일치하지 않는다.
 * (임의의 값을 PARAMS 로 해싱해 만든 것이며 비밀이 아니다.)
 */
const DUMMY_HASH =
  "scrypt$1$32768$8$1$AAAAAAAAAAAAAAAAAAAAAA==$" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
