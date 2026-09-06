# AUREUM

학교가 직접 사이트를 운영하되, 프레임워크·런타임·보안 패치·접근성·배포 운영은
중앙 플랫폼이 지속적으로 책임지는 공공 웹사이트 구축·운영 플랫폼.

- 제품 계획: [docs/PRODUCT_PLAN.md](docs/PRODUCT_PLAN.md)

## 지금까지 구현된 것

MVP 1~5단계 일부에 해당합니다. 노션 문서 05 의 단계 구분을 따릅니다.

| 영역 | 상태 |
|---|---|
| 도메인 모델 (Group / Organization / Site / Page / Board / Post / Asset / AuditLog) | Prisma 스키마 작성 완료 |
| 테넌트 경계 (`src/lib/tenant.ts`) | 조회 헬퍼 구현 |
| Page JSON 검증 (`src/lib/page-json.ts`) | 저장/렌더 경로 분리 구현 |
| Block Registry (`src/blocks/registry.ts`) | 블록 6종 등록 |
| KRDS 토큰 → CSS 변수 | 자동 변환 스크립트 구현 (고대비 모드 포함) |
| 드래그앤드롭 빌더 UI | 블록 추가·삭제·순서 변경·설정 편집 |
| 공개 사이트 라우팅 | Host 기반 + 게시판 목록/상세 |
| 인증 / RBAC | Auth.js v5 + 역할별 권한 (MFA는 P1로 보류) |
| 승인 흐름 | 편집자 승인 요청 → 승인자 공개 |
| 보안 헤더 | CSP(nonce) + HSTS + Referrer/Permissions Policy |
| 게시판 콘텐츠 편집 화면 | 목록 · 작성 · 수정 · 공개/중지 · 삭제 |
| 컨테이너 이미지 | 멀티스테이지 Dockerfile (non-root, standalone) |
| CI / 이미지 게시 | GitHub Actions → GHCR (amd64 + arm64, SBOM, Trivy) |
| 파일 업로드 | **미구현** |
| Migration Studio | **미구현** |
| K-PaaS 배포 | **미구현** |

## 개발 환경 준비

필요한 것: Node.js 20 이상, Docker Desktop.

```bash
npm install
cp .env.example .env
npm run db:up          # PostgreSQL 컨테이너 기동 (Docker Desktop 실행 중이어야 함)
npm run db:push        # 스키마를 DB에 반영
npm run db:seed        # 예시 학교 + 개발용 계정 생성
npm run dev
```

`.env` 에는 `AUTH_SECRET` 이 반드시 있어야 합니다. 없으면 로그인이 실패합니다.

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 개발용 계정

시드가 만드는 계정입니다. 비밀번호는 세 계정이 동일하며, 시드 실행 시
터미널에 출력됩니다. 고정하려면 `.env` 에 `SEED_PASSWORD` 를 설정하세요.
저장소에는 비밀번호를 두지 않습니다.

| 계정 | 역할 | 할 수 있는 일 |
|---|---|---|
| owner@example.com | OWNER | 전부 |
| approver@example.com | APPROVER | 편집 + 공개 |
| editor@example.com | EDITOR | 편집만. 공개는 승인 요청으로 |

## 주요 명령

| 명령 | 설명 |
|---|---|
| `npm run dev` | 개발 서버 |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | 타입 검사 |
| `npm run krds:tokens` | KRDS 토큰을 CSS 변수로 다시 생성 |
| `npm run db:up` / `db:down` | 로컬 PostgreSQL 기동 / 정지 |
| `npm run db:push` | 스키마를 DB에 반영 (마이그레이션 파일 없이) |
| `npm run db:studio` | Prisma Studio |
| `npm run db:seed` | 예시 데이터와 개발용 계정 생성 |

## 구조에서 꼭 지켜야 하는 것

### 1. 블록 컴포넌트는 편집기와 공개 사이트에서 같은 코드다

`src/blocks/*/index.tsx` 의 컴포넌트에는 편집 전용 코드를 넣지 않습니다.
선택 하이라이트나 드래그 핸들은 전부 바깥 래퍼가 담당합니다.

편집기에서 본 화면과 실제 학교 홈페이지가 다르면 제품 신뢰가 무너지기 때문에,
이 규칙이 깨지면 다른 어떤 기능도 의미가 없습니다.

그래서 블록 컴포넌트에는 다음 제약이 걸립니다.

- `"use client"` / `"use server"` 를 붙이지 않습니다.
- 데이터를 직접 가져오지 않습니다. `loader` 가 만들어 `data` prop 으로 넘깁니다.
- 상태를 갖지 않습니다. `props` 와 `data` 만으로 결정되어야 합니다.
- 날짜 포맷 같은 로케일 의존 연산은 `loader`(서버)에서 끝냅니다.
  컴포넌트에는 완성된 문자열만 넘깁니다.

### 2. 테넌트 경계는 함수 시그니처로 강제한다

`findPage(pageId)` 같은 함수는 만들지 않습니다.
tenant-scoped 데이터를 읽는 함수는 `TenantContext` 를 첫 인자로 받습니다
(`src/lib/tenant.ts`).

### 3. 레지스트리에 없는 블록은 존재하지 않는다

임의 HTML/CSS/JavaScript/플러그인을 허용하지 않는다는 원칙은
`src/blocks/registry.ts` 하나로 구현됩니다.
여기 없는 `type` 은 저장되지도, 렌더링되지도 않습니다.

### 4. 공개 페이지는 블록 하나 때문에 죽지 않는다

- **저장할 때**는 하나라도 어긋나면 전부 거부합니다.
- **렌더할 때**는 문제가 있는 블록만 건너뛰고 나머지를 그립니다.

이미 공개된 학교 홈페이지가 스키마 변경 때문에 통째로 500이 되는 상황을 막기 위한 것입니다.
건너뛴 블록은 `issues` 로 반환되므로 호출부에서 반드시 기록해야 합니다.

## KRDS 리소스

디자인 값은 KRDS 공식 패키지에서 가져오고, 손으로 옮겨 적지 않습니다.

```bash
npm run krds:tokens    # node_modules/krds-uiux/tokens → src/krds/tokens.generated.css
```

생성된 `src/krds/tokens.generated.css` 는 커밋합니다.
KRDS 를 업데이트했을 때 어떤 값이 바뀌었는지 diff 로 확인할 수 있어야 하기 때문입니다.

본문 서체(Pretendard GOV)는 패키지에서 `public/fonts` 로 복사해 사용합니다.

```bash
cp node_modules/krds-uiux/resources/fonts/*.woff2 public/fonts/
```

> **확인 필요**: `krds-uiux` 의 `package.json` 은 라이선스를 `ISC` 로 적고 있으나
> README 는 "KRDS 이용약관을 따름"이라고 명시합니다. 외부 배포 전에 정리해야 합니다.

## 컨테이너

운영 이미지는 GitHub Actions 에서만 만듭니다. 서버는 pull 만 합니다.
OCI A1 무료 티어(2 OCPU / 12GB)에서 빌드까지 돌리면 애플리케이션이 쓸 자원이
남지 않기 때문입니다.

로컬에서 이미지를 확인할 때는:

```bash
docker build -t aureum:local .
```

```bash
docker run --rm -p 3000:3000 -e DATABASE_URL="postgresql://..." -e AUTH_SECRET="..." aureum:local
```

- 실행 사용자는 root 가 아닙니다 (uid 1001).
- 비밀은 이미지에 굽지 않습니다. 빌드 단계에서 쓰는 `DATABASE_URL` 은 형식만
  맞는 가짜 값이며 실행 이미지에 남지 않습니다. 운영 값은 K-PaaS Secret 으로
  주입합니다.
- 기본 브랜치에 push 하면 amd64 / arm64 이미지가 GHCR 에 올라갑니다.
  같은 태그로 개발 PC(amd64)와 OCI A1(arm64)이 모두 받을 수 있습니다.
- 이미지에는 SBOM 과 build provenance 가 붙고, Trivy 스캔 결과가 GitHub
  Security 탭에 쌓입니다.

## 배포 방향

- 목표 환경: Oracle Cloud `VM.Standard.A1.Flex` (ARM64) + K-PaaS 단일 클러스터
- 무료 티어 한도는 2 OCPU / 12GB 이므로, **컨테이너 이미지 빌드는 서버에서 하지 않습니다.**
  GitHub Actions 에서 multi-arch 빌드 후 GHCR 에 올리고 서버는 pull 만 합니다.
- 같은 이유로 Redis/BullMQ 는 MVP 범위에서 제외합니다.
- **Ingress 뒤에 배포할 때 주의**: Auth.js 는 production 빌드에서 Host 를 신뢰하지
  않으면 로그인이 `UntrustedHost` 로 실패합니다. 개발 모드에서는 자동 통과하므로
  배포 후에야 드러납니다. `src/auth.config.ts` 의 `trustHost: true` 가 이를 해결하며,
  대신 Ingress 에 명시적인 host 규칙을 두어 임의 Host 를 걸러야 합니다.
  가능하면 `AUTH_URL` 을 실제 공개 주소로 고정하세요.
