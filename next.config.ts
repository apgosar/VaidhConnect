import type { NextConfig } from "next";

const isProd = process.env.NODE_ENV === 'production'

// Content-Security-Policy. Next's own hydration data needs inline scripts, so
// 'unsafe-inline' stays for script-src; everything else is locked to the
// origins the app really uses: Google Fonts, Firebase Auth (sign-in), Google
// Cloud Storage images, and YouTube embeds. Dev mode needs eval for HMR, so
// the policy is only applied in production builds.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://storage.googleapis.com",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://fonts.gstatic.com",
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  ...(isProd
    ? [
        { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        { key: 'Content-Security-Policy', value: csp },
      ]
    : []),
]

const nextConfig: NextConfig = {
  output: 'standalone',
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
      },
    ],
    // Images are served as-is from Cloud Storage (no optimizer, so SVG handling is moot).
    unoptimized: true,
  },
  serverExternalPackages: ['@react-pdf/renderer'],
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      // API responses can hold patient data: never let a browser or proxy cache them.
      { source: '/api/:path*', headers: [{ key: 'Cache-Control', value: 'no-store' }] },
    ]
  },
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
