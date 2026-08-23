import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    dangerouslyAllowSVG: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
    // Allow base64 data URIs (used when GCS is not configured)
    unoptimized: true,
  },
  serverExternalPackages: ['@react-pdf/renderer'],
  async rewrites() {
    return [
      {
        source: '/favicon.ico',
        destination: '/api/clinic-icon',
      },
    ]
  },
};

export default nextConfig;

