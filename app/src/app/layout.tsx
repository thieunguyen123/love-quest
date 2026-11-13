import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin", "vietnamese"] });

export const metadata: Metadata = {
  title: "Love Quest",
  description: "Game học tiếng Anh cho hai người 💕",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${nunito.variable} antialiased`}>{children}</body>
    </html>
  );
}
