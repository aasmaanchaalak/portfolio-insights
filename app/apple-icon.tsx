import { ImageResponse } from 'next/og';

// Generated app icon: white "S" on Sagun crimson. iOS rounds the corners itself.
export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#b3261e',
          color: '#ffffff',
          fontSize: 111,
          fontWeight: 700,
          fontFamily: 'serif',
        }}
      >
        S
      </div>
    ),
    size,
  );
}
