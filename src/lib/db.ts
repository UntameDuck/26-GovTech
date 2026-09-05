import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

/**
 * Prisma 7 은 driver adapter 를 통해 접속한다.
 * 개발 중 HMR 이 커넥션을 계속 새로 만들지 않도록 전역에 한 번만 둔다.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL 이 설정되지 않았습니다. .env 를 확인하세요.");
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
