import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite (the local development database) loads its WebAssembly from its own package files.
  serverExternalPackages: ["@electric-sql/pglite"],
  experimental: {
    serverActions: {
      // "Get my Outfits" sends the photo. Start a Consultation refuses anything over 2 MB itself;
      // this leaves room above that for the form's own bytes.
      bodySizeLimit: "3mb",
    },
  },
};

export default nextConfig;
