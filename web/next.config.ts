import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emits a self-contained server bundle with only the node_modules actually
  // reached. Vercel ignores this; Docker and Kubernetes depend on it, and having
  // it from the start is what keeps the cluster path a config change rather than
  // a rewrite.
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
};

export default nextConfig;
