import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the monorepo root so Next doesn't pick up a stray lockfile higher up.
  outputFileTracingRoot: path.join(__dirname, "../.."),
};

export default nextConfig;
