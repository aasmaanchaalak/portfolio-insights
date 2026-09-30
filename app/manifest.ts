import type { MetadataRoute } from 'next';
import { getFirmSettingsSafe } from '../lib/firmSettings';

// Firm name is admin-editable, so don't bake it in at build time.
export const dynamic = 'force-dynamic';

// Lets the site be added to the home screen and open full-screen (no Safari UI).
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const firm = await getFirmSettingsSafe();
  return {
    name: firm.name,
    short_name: firm.shortName,
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [{ src: '/icon.png', sizes: '500x500', type: 'image/png' }],
  };
}
