import "dotenv/config";
import { randomBytes } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, type OrgRole } from "@prisma/client";
import { hashPassword } from "../src/lib/password";

/**
 * 개발용 시드 데이터.
 *
 * 목적은 "화면이 뜨는지" 확인이 아니라, 실제 학교 홈페이지에서 반복해서 나타나는
 * 구성(공지 + 가정통신문 + 사진 + 학사일정 + 급식)을 한 번에 재현하는 것이다.
 * docs/PRODUCT_PLAN.md 의 참고 사이트 조사 결과를 그대로 따른다.
 *
 * 실행: npm run db:seed
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL 이 설정되지 않았습니다. .env 를 확인하세요.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

/** 오늘로부터 n일 뒤(음수면 과거) 날짜. 시드가 언제 돌아도 최근 글처럼 보이게 한다. */
function daysFromNow(n: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + n);
  date.setHours(9, 0, 0, 0);
  return date;
}

async function main() {
  console.log("시드를 시작합니다...");

  // 기존 시드 데이터를 지운다. Cascade 로 하위가 함께 지워진다.
  await prisma.organization.deleteMany({ where: { slug: "demo-school" } });
  await prisma.group.deleteMany({ where: { slug: "demo-office" } });

  const group = await prisma.group.create({
    data: {
      slug: "demo-office",
      name: "예시교육지원청",
      region: "대전광역시",
    },
  });

  const organization = await prisma.organization.create({
    data: {
      slug: "demo-school",
      name: "한빛고등학교",
      kind: "SCHOOL",
      groupId: group.id,
    },
  });

  const site = await prisma.site.create({
    data: {
      organizationId: organization.id,
      slug: "demo-school",
      name: "한빛고등학교",
      // 로컬에서는 DEFAULT_SITE_SLUG 로 찾으므로 도메인을 비워 둔다.
      domain: null,
      published: true,
      settings: {},
    },
  });

  // ---------------------------------------------------------------- 계정

  /*
   * 개발용 계정. 역할별로 하나씩 만들어 권한 차이를 바로 확인할 수 있게 한다.
   * 실제 학교 계정은 초대 흐름으로 만든다(추후 구현).
   *
   * 비밀번호는 저장소에 두지 않는다.
   * SEED_PASSWORD 를 주면 그 값을 쓰고, 없으면 매번 새로 만들어 출력한다.
   * 코드에 기본값을 박아 두면 결국 그것이 어딘가의 실제 비밀번호가 된다.
   */
  const generated = !process.env.SEED_PASSWORD;
  const DEV_PASSWORD =
    process.env.SEED_PASSWORD ?? randomBytes(9).toString("base64url");

  const accounts: Array<{ email: string; name: string; role: OrgRole }> = [
    { email: "owner@example.com", name: "김소유", role: "OWNER" },
    { email: "approver@example.com", name: "박승인", role: "APPROVER" },
    { email: "editor@example.com", name: "이편집", role: "EDITOR" },
  ];

  for (const account of accounts) {
    // 계정마다 따로 해싱한다. 한 번 만든 해시를 돌려쓰면 salt 가 공유되어,
    // 같은 비밀번호를 쓰는 계정들이 DB 에서 한눈에 드러난다.
    // 개발용 시드라도 이런 패턴은 그대로 운영 코드로 복사되기 쉽다.
    const passwordHash = await hashPassword(DEV_PASSWORD);

    const user = await prisma.user.upsert({
      where: { email: account.email },
      update: { name: account.name, passwordHash },
      create: {
        email: account.email,
        name: account.name,
        passwordHash,
      },
    });

    await prisma.organizationMembership.upsert({
      where: {
        userId_organizationId: {
          userId: user.id,
          organizationId: organization.id,
        },
      },
      update: { role: account.role },
      create: {
        userId: user.id,
        organizationId: organization.id,
        role: account.role,
      },
    });
  }

  // ---------------------------------------------------------------- 게시판

  const boardSpecs = [
    { slug: "notice", name: "공지사항", kind: "NOTICE" },
    { slug: "letters", name: "가정통신문", kind: "PARENT_LETTER" },
    { slug: "gallery", name: "학교 사진", kind: "GALLERY" },
    { slug: "calendar", name: "학사일정", kind: "SCHEDULE" },
    { slug: "meal", name: "급식 식단", kind: "MEAL" },
  ];

  const boards: Record<string, string> = {};
  for (const spec of boardSpecs) {
    const board = await prisma.board.create({
      data: { siteId: site.id, ...spec },
    });
    boards[spec.slug] = board.id;
  }

  // ---------------------------------------------------------------- 게시물

  const notices = [
    { title: "2026학년도 2학기 학사일정 안내", pinned: true, day: -1 },
    { title: "겨울방학 방과후학교 수강 신청 안내", pinned: false, day: -3 },
    { title: "학교운영위원회 위원 모집 공고", pinned: false, day: -5 },
    { title: "교내 정보보호 교육 실시 안내", pinned: false, day: -8 },
    { title: "졸업앨범 촬영 일정 변경 안내", pinned: false, day: -12 },
  ];

  for (const notice of notices) {
    await prisma.post.create({
      data: {
        boardId: boards.notice!,
        siteId: site.id,
        title: notice.title,
        body: "상세 내용은 첨부파일을 확인해 주세요.",
        status: "PUBLISHED",
        pinned: notice.pinned,
        publishedAt: daysFromNow(notice.day),
      },
    });
  }

  const letters = [
    { title: "제38호 - 겨울철 안전 생활 안내", day: -2 },
    { title: "제37호 - 학부모 상담주간 운영 안내", day: -6 },
    { title: "제36호 - 교육급여 신청 안내", day: -10 },
  ];

  for (const letter of letters) {
    await prisma.post.create({
      data: {
        boardId: boards.letters!,
        siteId: site.id,
        title: letter.title,
        body: "가정에서도 함께 지도해 주시기 바랍니다.",
        status: "PUBLISHED",
        publishedAt: daysFromNow(letter.day),
      },
    });
  }

  // 사진 게시판. 첨부 이미지는 아직 업로드 기능이 없으므로 비워 둔다.
  // Gallery 블록은 이미지가 없으면 "이미지 없음" 자리표시자를 그린다.
  const photos = [
    { title: "체육대회 - 학급 대항 계주", day: -4 },
    { title: "가을 독서 한마당", day: -9 },
    { title: "동아리 발표회", day: -15 },
    { title: "1학년 진로 체험의 날", day: -21 },
  ];

  for (const photo of photos) {
    await prisma.post.create({
      data: {
        boardId: boards.gallery!,
        siteId: site.id,
        title: photo.title,
        body: "",
        status: "PUBLISHED",
        publishedAt: daysFromNow(photo.day),
      },
    });
  }

  const schedules = [
    { title: "2학기 기말고사", day: 3 },
    { title: "겨울방학식", day: 12 },
    { title: "졸업식", day: 40 },
  ];

  for (const schedule of schedules) {
    await prisma.post.create({
      data: {
        boardId: boards.calendar!,
        siteId: site.id,
        title: schedule.title,
        body: "",
        status: "PUBLISHED",
        publishedAt: daysFromNow(schedule.day),
      },
    });
  }

  // Meal 블록은 게시물 제목을 쉼표로 잘라 메뉴 목록으로 쓴다 (MVP 형태).
  const meals = [
    { title: "찰보리밥, 근대된장국, 돼지갈비찜, 콩나물무침, 배추김치", day: 0 },
    { title: "기장밥, 유부장국, 함박스테이크, 감자샐러드, 깍두기", day: -1 },
    { title: "흑미밥, 순두부찌개, 고등어구이, 시금치나물, 배추김치", day: -2 },
  ];

  for (const meal of meals) {
    await prisma.post.create({
      data: {
        boardId: boards.meal!,
        siteId: site.id,
        title: meal.title,
        body: "",
        status: "PUBLISHED",
        publishedAt: daysFromNow(meal.day),
      },
    });
  }

  // ---------------------------------------------------------------- 홈페이지

  // Page JSON. 실제 학교 홈페이지의 첫 화면 구성 순서를 따른다.
  const homeLayout = [
    {
      id: "hero-1",
      type: "hero",
      props: {
        title: "",
        subtitle: "배움과 나눔이 함께하는 학교",
        imageAssetId: "",
        align: "left",
      },
    },
    {
      id: "quick-1",
      type: "quickLinks",
      props: {
        heading: "자주 찾는 메뉴",
        links: [
          { label: "공지사항", href: "/notice", description: "학교 소식" },
          { label: "가정통신문", href: "/letters", description: "학부모 안내" },
          { label: "학사일정", href: "/calendar", description: "주요 일정" },
          { label: "급식 식단", href: "/meal", description: "이번 주 식단" },
        ],
      },
    },
    {
      id: "notice-1",
      type: "noticeBoard",
      props: {
        heading: "공지사항",
        boardSlug: "notice",
        count: 5,
        showDate: true,
        showMoreLink: true,
      },
    },
    {
      id: "notice-2",
      type: "noticeBoard",
      props: {
        heading: "가정통신문",
        boardSlug: "letters",
        count: 3,
        showDate: true,
        showMoreLink: true,
      },
    },
    {
      id: "meal-1",
      type: "meal",
      props: { heading: "오늘의 급식", boardSlug: "meal", days: 3 },
    },
    {
      id: "calendar-1",
      type: "calendar",
      props: { heading: "학사일정", boardSlug: "calendar", count: 3 },
    },
    {
      id: "gallery-1",
      type: "gallery",
      props: {
        heading: "학교 사진",
        boardSlug: "gallery",
        count: 4,
        columns: "4",
      },
    },
  ];

  await prisma.page.create({
    data: {
      siteId: site.id,
      slug: "",
      title: "홈",
      status: "PUBLISHED",
      draftLayout: homeLayout,
      publishedLayout: homeLayout,
      publishedAt: new Date(),
    },
  });

  const postCount = await prisma.post.count({ where: { siteId: site.id } });

  console.log("시드 완료");
  console.log(`  교육청  ${group.name}`);
  console.log(`  학교    ${organization.name} (${site.slug})`);
  console.log(`  게시판  ${boardSpecs.length}개`);
  console.log(`  게시물  ${postCount}개`);
  console.log(`  홈페이지 블록 ${homeLayout.length}개`);
  console.log("");
  console.log(`  개발용 계정 (비밀번호는 모두 ${DEV_PASSWORD})`);
  if (generated) {
    console.log("  ↑ 이번에 생성한 임시 비밀번호입니다. 고정하려면 .env 에 SEED_PASSWORD 를 설정하세요.");
  }
  for (const account of accounts) {
    console.log(`    ${account.role.padEnd(9)} ${account.email}`);
  }
}

main()
  .catch((error) => {
    console.error("시드 실패:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
