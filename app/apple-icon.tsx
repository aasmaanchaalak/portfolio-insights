import { renderAppIcon } from '../lib/appIcon';

// Home-screen icon, from Admin → Firm settings. iOS rounds the corners itself.
export const dynamic = 'force-dynamic';
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function Icon() {
  return renderAppIcon(180);
}
