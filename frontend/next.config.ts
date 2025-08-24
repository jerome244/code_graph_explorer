import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
    "compilerOptions": {
    "baseUrl": ".",
    "paths": { "@/*": ["./*"] }
  }
};

export default nextConfig;
