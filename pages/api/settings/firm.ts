import { NextApiRequest, NextApiResponse } from 'next';
import { withAuth, authUser } from '../../../lib/authMiddleware';
import { BENCHMARKS } from '../../../lib/benchmarks';
import {
  getFirmSettings,
  updateFirmSettings,
  FirmSettingsUpdate,
  LOGO_TYPES,
  ICON_TYPES,
  MAX_LOGO_BYTES,
} from '../../../lib/firmSettings';

// Logo and app icon can arrive together, each up to 500 KB (~670 KB as base64).
export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

// GET → firm name, logo URL, benchmark   (public: the login screen and manifest need it)
// PUT → { name?, shortName?, benchmark?, logo?: dataURL | null, icon?: dataURL | null, showNameWithLogo?: boolean }   (admin only)
async function update(req: NextApiRequest, res: NextApiResponse) {
  if (!authUser(req).isAdmin) {
    return res.status(403).json({ error: 'Access denied. Admin only.' });
  }

  const { name, shortName, benchmark, logo, icon, showNameWithLogo } = req.body || {};
  const patch: FirmSettingsUpdate = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.length > 80) {
      return res.status(400).json({ error: 'Firm name must be 1–80 characters' });
    }
    patch.name = name;
  }
  if (shortName !== undefined) {
    if (typeof shortName !== 'string' || shortName.length > 30) {
      return res.status(400).json({ error: 'Short name must be at most 30 characters' });
    }
    patch.shortName = shortName;
  }
  if (showNameWithLogo !== undefined) {
    if (typeof showNameWithLogo !== 'boolean') {
      return res.status(400).json({ error: 'showNameWithLogo must be true or false' });
    }
    patch.showNameWithLogo = showNameWithLogo;
  }
  if (benchmark !== undefined) {
    if (!BENCHMARKS.some(b => b.symbol === benchmark)) {
      return res.status(400).json({ error: 'Unknown benchmark index' });
    }
    patch.benchmark = benchmark;
  }
  if (logo !== undefined) {
    if (logo !== null) {
      const m = typeof logo === 'string' ? logo.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/) : null;
      if (!m || !LOGO_TYPES.includes(m[1])) {
        return res.status(400).json({ error: 'Logo must be a PNG, JPEG, WebP or SVG image' });
      }
      if (Buffer.byteLength(m[2], 'base64') > MAX_LOGO_BYTES) {
        return res.status(400).json({ error: 'Logo must be under 500 KB' });
      }
    }
    patch.logo = logo;
  }
  if (icon !== undefined) {
    if (icon !== null) {
      const m = typeof icon === 'string' ? icon.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/) : null;
      if (!m || !ICON_TYPES.includes(m[1])) {
        return res.status(400).json({ error: 'App icon must be a PNG or JPEG image' });
      }
      if (Buffer.byteLength(m[2], 'base64') > MAX_LOGO_BYTES) {
        return res.status(400).json({ error: 'App icon must be under 500 KB' });
      }
    }
    patch.icon = icon;
  }

  const saved = await updateFirmSettings(patch);
  return res.status(200).json(saved);
}

const authedUpdate = withAuth(update);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json(await getFirmSettings());
    }
    if (req.method === 'PUT') {
      return authedUpdate(req, res);
    }
    res.setHeader('Allow', ['GET', 'PUT']);
    return res.status(405).json({ error: `Method ${req.method} Not Allowed` });
  } catch (error) {
    console.error('Firm settings API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
