import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AUREUM",
  description: "공공 웹사이트 구축·운영 플랫폼",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // lang="ko" 는 스크린리더가 한국어로 읽게 하는 최소 조건이다 (KWCAG 2.2).
    <html lang="ko" className="h-full">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
