import { readFileSync } from 'fs';
import { join } from 'path';
import { ImageResponse } from 'next/og';

// Home-screen icon: the Sagun mark (app/icon.png) on white. The mark is
// transparent, and iOS would otherwise fill the background with black; iOS
// rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function Icon() {
  const mark = `data:image/png;base64,${readFileSync(join(process.cwd(), 'app', 'icon.png')).toString('base64')}`;
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#ffffff' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={mark} width={180} height={180} alt="" />
      </div>
    ),
    size,
  );
}
