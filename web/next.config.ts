import type { NextConfig } from "next";

// No script-src on purpose: a nonce policy would force every page dynamic, and these
// directives close clickjacking and base-tag attacks without touching scripts. No form-action:
// Chromium applies it to redirects, which would block the Google sign-in action before hydration.
const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Self-contained server bundle for Docker and Kubernetes. Skipped on Vercel, whose build
  // step fails with ENOENT on .next/next-server.js.nft.json when standalone is on.
  output: process.env.VERCEL ? undefined : "standalone",
  outputFileTracingRoot: process.cwd(),
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            // Photos come from a file picker, so the camera is not needed. The pin map does not
            // use geolocation either.
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
