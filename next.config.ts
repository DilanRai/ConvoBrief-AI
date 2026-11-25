import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // An unrelated lockfile in the parent directory otherwise makes Next.js
  // infer the wrong workspace root.
  turbopack: {
    root: path.resolve(__dirname),
  },
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
