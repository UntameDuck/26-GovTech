import "dotenv/config";
import { defineConfig, env } from "prisma/config";

/**
 * Prisma 7 부터 접속 URL 은 schema.prisma 가 아니라 이 파일에서 관리한다.
 * 여기의 datasource 는 migrate / db push 같은 CLI 명령이 사용하고,
 * 런타임 PrismaClient 는 src/lib/db.ts 의 driver adapter 를 사용한다.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: env("DATABASE_URL"),
  },
});
