import type { NextConfig } from "next";

// No script-src on purpose: a nonce policy would force every page dynamic, and these
// directives close clickjacking, base-tag and form-hijack attacks without touching scripts.
const CONTENT_SECURITY_POLICY = [
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle with only the node_modules actually
  // reached. Vercel ignores this; Docker and Kubernetes depend on it, and having
  // it from the start is what keeps the cluster path a config change rather than
  // a rewrite.
  output: "standalone",
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
