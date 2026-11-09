import type { Metadata } from "next";
import type { ReactNode } from "react";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const socialImage = new URL("/og-cifi-ultimate.png", base).toString();

  return {
    metadataBase: base,
    title: "CIFI Ultimate Optimizer",
    description: "Mod Tree·다이아/토큰 업그레이드·Ship Install 추천과 진행도 입력을 브라우저에 저장해 관리하는 CIFI 계산 도구입니다.",
    openGraph: {
      title: "CIFI Ultimate Optimizer",
      description: "Mod Tree·다이아/토큰 업그레이드·Ship Install 추천과 진행도 입력을 브라우저에 저장해 관리하는 CIFI 계산 도구입니다.",
      images: [{ url: socialImage, width: 1730, height: 909, alt: "CIFI Ultimate Optimizer" }],
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: "CIFI Ultimate Optimizer",
      description: "Mod Tree·다이아/토큰 업그레이드·Ship Install 추천과 진행도 입력을 브라우저에 저장해 관리하는 CIFI 계산 도구입니다.",
      images: [socialImage],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ko">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
