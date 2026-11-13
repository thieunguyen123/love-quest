import type { Metadata } from "next";
import { Nunito } from "next/font/google";
import "./globals.css";
import { PwaRegister } from "@/components/pwa";

const nunito = Nunito({ variable: "--font-nunito", subsets: ["latin", "vietnamese"] });

export const viewport = { themeColor: "#ec4899" };

export const metadata: Metadata = {
  title: "Love Quest",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Love Quest", statusBarStyle: "default" as const },
  icons: { apple: "/apple-touch-icon.png" },
  description: "Game học tiếng Anh cho hai người 💕",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body suppressHydrationWarning className={`${nunito.variable} antialiased`}>{children}<PwaRegister /></body>
    </html>
  );
}
