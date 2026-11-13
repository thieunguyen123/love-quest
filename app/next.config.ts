import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Cho phép chạy 2 bản server song song (dev & test) bằng cách đổi thư mục build
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
