import { NextRequest } from 'next/server';
import { renderAppIcon } from '../../lib/appIcon';

// The firm's app icon (Admin → Firm settings) as a PNG: favicon, home-screen
// icon, PWA manifest and push notifications. ?size=180 for iOS, 512 otherwise.
// Links carry ?v=<icon hash> (see appIconUrl), so versioned requests can be
// cached for good; unversioned ones (push notifications) only briefly.
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const px = params.get('size') === '180' ? 180 : 512;
  const cache = params.has('v') ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
  return renderAppIcon(px, cache);
}
