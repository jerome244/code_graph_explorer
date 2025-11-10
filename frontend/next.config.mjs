/** @type {import('next').NextConfig} */
const isPages = process.env.GITHUB_PAGES === "true";
const repo = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";

const nextConfig = {
  experimental: {
    serverActions: { allowedOrigins: ["*"] },
  },

  // We only want to export static HTML when deploying to GitHub Pages
  ...(isPages
    ? {
        output: "export",              // enable `next export`
        images: { unoptimized: true }, // Pages has no image optimizer
        basePath: `/${repo}`,
        assetPrefix: `/${repo}/`,
      }
    : {}),
};

export default nextConfig;
