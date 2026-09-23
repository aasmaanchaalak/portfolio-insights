import type { MetadataRoute } from 'next';

// Lets the site be added to the home screen and open full-screen (no Safari UI).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Sagun Capital',
    short_name: 'Sagun',
    start_url: '/',
    display: 'standalone',
    background_color: '#ffffff',
    theme_color: '#ffffff',
    icons: [{ src: '/icon', sizes: '512x512', type: 'image/png' }],
  };
}
