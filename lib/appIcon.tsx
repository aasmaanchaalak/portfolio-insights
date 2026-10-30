import { ImageResponse } from 'next/og';
import { getFirmLogoImage, getFirmSettingsSafe } from './firmSettings';

// Renders the firm's app icon (Admin → Firm settings) as a square PNG on white,
// for the favicon, home-screen icon, PWA manifest and push notifications.
// Without an uploaded icon it draws the first letter of the firm's short name.
export async function renderAppIcon(px: number): Promise<ImageResponse> {
  const [image, firm] = await Promise.all([
    getFirmLogoImage('icon').catch(() => null),
    getFirmSettingsSafe(),
  ]);
  const src = image ? `data:${image.type};base64,${image.data.toString('base64')}` : null;
  return new ImageResponse(
    (
      // White background: the mark may be transparent, and iOS would fill it with black.
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} width={px} height={px} alt="" style={{ objectFit: 'contain' }} />
        ) : (
          <div style={{ fontSize: px * 0.6, fontWeight: 700, color: '#1f2937' }}>
            {(firm.shortName || firm.name).trim().charAt(0).toUpperCase() || 'P'}
          </div>
        )}
      </div>
    ),
    { width: px, height: px },
  );
}
