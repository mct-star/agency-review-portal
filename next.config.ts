import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/generate/studio", destination: "/generate", permanent: true },
      { source: "/generate/single", destination: "/generate/quick", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
  // Ensure font files are included in the serverless function bundle
  // (Vercel's tree-shaking won't include .ttf files automatically)
  outputFileTracingIncludes: {
    "/api/generate/overlay/*": ["./src/lib/image/fonts/**/*"],
  },
};

export default nextConfig;
