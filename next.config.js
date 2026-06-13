/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "45mb",
    },
  },
};

module.exports = nextConfig;
