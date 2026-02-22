/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  basePath: '/I23D',
  images: {
    unoptimized: true,
  },
  generateBuildId: async () => {
    // Force unique build IDs to avoid stale chunk caching
    return `build-${Date.now()}`
  },
  webpack: (config) => {
    // Add a salt to force new chunk hashes on every build
    // This prevents stale cached chunks from being served
    config.output.hashSalt = `deploy-${Date.now()}`
    return config
  },
}

module.exports = nextConfig
