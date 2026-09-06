# AUREUM 컨테이너 이미지
#
# 목표 환경은 OCI A1 (ARM64) 위의 K-PaaS 단일 클러스터다.
# 개발 PC 는 amd64 이므로 같은 태그로 두 아키텍처를 모두 받을 수 있어야 한다.
# 빌드는 GitHub Actions 에서 하고 서버는 pull 만 한다.
# 무료 티어(2 OCPU / 12GB)에서 이미지 빌드까지 돌리면 자원이 남지 않는다.
#
# 아키텍처 문서 03 의 L2(Runtime/Container) 요구사항을 반영한다.
#   - non-root 실행
#   - 최소 base image
#   - Secret 은 이미지에 굽지 않고 외부에서 주입

# Node 22 LTS. 짝수 메이저만 LTS 가 되므로 홀수 버전(25 등)은 쓰지 않는다.
# alpine 은 musl 기반이라 이미지가 작다. Prisma 7 은 driver adapter 를 쓰므로
# 예전처럼 아키텍처별 엔진 바이너리를 맞출 필요가 없다.
ARG NODE_VERSION=22.20.0
ARG ALPINE_VERSION=3.21

# ---------------------------------------------------------------- 의존성

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS deps
WORKDIR /app

# lockfile 기준으로만 설치한다. 빌드마다 의존성이 달라지면
# SBOM 과 취약점 스캔 결과를 신뢰할 수 없다.
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# postinstall 이 prisma generate 를 부른다. 스키마를 먼저 복사한 이유다.
#
# prisma.config.ts 의 env("DATABASE_URL") 은 값이 없으면 즉시 예외를 던진다.
# generate 는 DB 에 접속하지 않지만 설정 파일 로드 단계에서 먼저 걸린다.
# 그래서 빌드 단계에만 쓰는 가짜 값을 준다. 이 값으로는 어디에도 붙지 않으며,
# 실행 이미지에는 남지 않는다(runner 스테이지에서 다시 복사하지 않는다).
# 운영 값은 K-PaaS Secret 으로 주입한다.
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    sh -c 'npm ci --ignore-scripts && npx prisma generate'

# ---------------------------------------------------------------- 빌드

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# 빌드 시점에 DB 에 붙지 않는다. 모든 페이지가 동적이라 필요가 없고,
# 빌드가 DB 를 요구하면 CI 가 DB 없이는 돌지 못한다.
#
# 다만 src/lib/db.ts 가 모듈 로드 시점에 DATABASE_URL 을 확인하므로
# 형식만 맞는 가짜 값을 준다. 접속은 일어나지 않고, 실행 이미지에도 남지 않는다.
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" \
    AUTH_SECRET="build-time-only-not-a-real-secret" \
    npm run build

# ---------------------------------------------------------------- 실행

FROM node:${NODE_VERSION}-alpine${ALPINE_VERSION} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# root 로 실행하지 않는다. 컨테이너가 뚫려도 권한을 최소로 묶는다.
RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 --ingroup nodejs nextjs

# standalone 산출물만 옮긴다. 소스와 개발 의존성은 이미지에 넣지 않는다.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

USER nextjs
EXPOSE 3000

# 컨테이너 안에서 자기 자신에게 요청해 확인한다.
# 외부 도구를 설치하지 않으려고 node 로 처리한다.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
