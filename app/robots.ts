import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: '*', allow: '/' },
      {
        userAgent: ['GPTBot', 'CCBot', 'Google-Extended', 'ClaudeBot', 'anthropic-ai'],
        disallow: '/',
      },
    ],
  };
}
