import { ImageResponse } from 'next/og';

// Generated app icon: white "S" on Sagun crimson. 
export const size = { width: 512, height: 512 };
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
          fontSize: 317,
          fontWeight: 700,
          fontFamily: 'serif',
          borderRadius: 96,
        }}
      >
        S
      </div>
    ),
    size,
  );
}
