import { renderAppIcon } from '../lib/appIcon';

// Favicon / PWA / notification icon, from Admin → Firm settings.
export const dynamic = 'force-dynamic';
export const size = { width: 512, height: 512 };
export const contentType = 'image/png';

export default function Icon() {
  return renderAppIcon(512);
}
