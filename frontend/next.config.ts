import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/api/darkweb/:path*", destination: "http://127.0.0.1:8000/api/darkweb/:path*" },
      { source: "/api/osint/:path*",   destination: "http://127.0.0.1:8000/api/osint/:path*" },
    ];
  },
};

export default nextConfig;
