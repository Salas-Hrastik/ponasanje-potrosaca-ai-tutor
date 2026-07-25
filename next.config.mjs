/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse i jszip koriste se samo u ingest skriptama (Node), nikad u
  // web buildu — ne smiju se bundlati u server build.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'jszip'],
  },
};

export default nextConfig;
