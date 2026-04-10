import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* Cloudflare Pages config */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
