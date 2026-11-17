import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.SCHEDULA_TEST_DIST_DIR ?? ".next",
  cacheComponents: true,
  partialPrefetching: true,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
};

export default nextConfig;
