/** @type {import('next').NextConfig} */
const isPages = process.env.GITHUB_PAGES === "true";
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";

const nextConfig = {
  experimental: { serverActions: { allowedOrigins: ["*"] } },
  ...(isPages
    ? {
        output: "export",
        images: { unoptimized: true },
        basePath: `/${repo}`,
        assetPrefix: `/${repo}/`,
      }
    : {}),
};
export default nextConfig;
