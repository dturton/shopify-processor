/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  // Enable API routes to connect to our backend
  rewrites: async () => {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:3000/api/:path*", // Proxy to backend
      },
    ];
  },
};

module.exports = nextConfig;
