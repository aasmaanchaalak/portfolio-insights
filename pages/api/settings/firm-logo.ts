import { NextApiRequest, NextApiResponse } from 'next';
import { getFirmLogoImage } from '../../../lib/firmSettings';

// Serves the uploaded firm logo. Public, like the logo in /public it replaces.
// URLs carry a content hash (?v=), so responses can be cached for a long time.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const image = await getFirmLogoImage();
    if (!image) return res.status(404).end();

    res.setHeader('Content-Type', image.type);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    // SVGs can carry script; never let one run if the URL is opened directly.
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    return res.status(200).send(image.data);
  } catch (error) {
    console.error('Firm logo error:', error);
    return res.status(500).end();
  }
}
