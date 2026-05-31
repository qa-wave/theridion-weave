import path from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const WEAVE_ROOT = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  turbopack: {
    root: WEAVE_ROOT,
  },
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  logging: {
    fetches: {
      fullUrl: process.env.NODE_ENV === "development",
    },
  },
  images: {
    remotePatterns: [],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
