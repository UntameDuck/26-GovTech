import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * 컨테이너 배포용 최소 산출물을 만든다.
   *
   * standalone 은 실제로 import 되는 파일만 추려 .next/standalone 에 모은다.
   * node_modules 전체를 이미지에 넣지 않아도 되므로 이미지가 작아지고,
   * 그만큼 취약점 스캔 대상(공격면)도 줄어든다.
   * 2 OCPU / 12GB 인 OCI A1 에서는 이미지 pull 시간도 무시할 수 없다.
   */
  output: "standalone",

  /**
   * Prisma 는 스키마 파일을 런타임에 읽는다.
   * 파일 추적이 스키마를 놓치면 컨테이너에서만 실패하므로 명시적으로 포함한다.
   */
  outputFileTracingIncludes: {
    "/**": ["./prisma/schema.prisma"],
  },

  // 빌드 시점에 타입 오류를 숨기지 않는다.
  // CI 에서 걸러야 할 것을 이미지 안으로 들여보내지 않기 위한 것이다.
  // (Next.js 16 부터 lint 는 빌드에서 분리되어 별도 명령으로 돌린다.)
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
