import { NextResponse } from 'next/server';

export const dynamic = 'force-static';

export function GET() {
  return NextResponse.json(
    [{ location: '/', 'tdm-reservation': 1 }],
    {
      headers: {
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'tdm-reservation': '1',
      },
    }
  );
}
