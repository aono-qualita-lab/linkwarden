/** @type {import('next').NextConfig} */
const { version } = require("./package.json");
const { i18n } = require("./next-i18next.config");

const nextConfig = {
  basePath: "/link",
  assetPrefix: "/link",
  i18n,
  reactStrictMode: true,
  staticPageGenerationTimeout: 1000,
  // Allow HMR WebSocket connections from the reverse proxy (Nginx) domain
  allowedDevOrigins: ["shirokumaworks.jp", "localhost"],
  images: {
    remotePatterns: [
      // For profile pictures (Google OAuth)
      { hostname: "*.googleusercontent.com" },
    ],

    minimumCacheTTL: 10,
  },
  transpilePackages: ["@linkwarden/prisma"],
  env: {
    version,
  },
  webpack(config) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
    };

    return config;
  },
};

module.exports = nextConfig;
