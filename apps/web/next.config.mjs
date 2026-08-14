/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@dfi/core", "@dfi/providers", "@dfi/report"],
  serverExternalPackages: ["playwright-core"],
};

export default nextConfig;
