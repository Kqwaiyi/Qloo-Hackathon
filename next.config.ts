import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the local development database) loads its WebAssembly from its own package files.
  serverExternalPackages: ["@electric-sql/pglite"],
};

export default nextConfig;
