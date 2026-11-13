import type { NextApiRequest } from 'next';
import { timingSafeEqual } from 'crypto';

/** Cron endpoints (GitHub Actions): "Authorization: Bearer <CRON_SECRET>", no user session. */
export function cronAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!secret || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
