/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdf-parse i jszip koriste se samo u ingest skriptama (Node), nikad u
  // web buildu — ne smiju se bundlati u server build.
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'jszip'],
  },
  async headers() {
    return [
      {
        // Strojno čitljiv pridržaj prava na rudarenje teksta i podataka (TDM).
        source: '/:path*',
        headers: [
          {
            key: 'tdm-reservation',
            value: '1',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
