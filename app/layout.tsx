import './globals.css'
import type { Metadata } from 'next'
import { Providers } from './providers'
import { getFirmSettingsSafe } from '../lib/firmSettings'

// Firm name comes from Admin → Firm settings, so metadata is resolved per request.
export async function generateMetadata(): Promise<Metadata> {
  const firm = await getFirmSettingsSafe()
  return {
    title: firm.name,
    description: 'Analyze stock performance with advanced sorting and filtering',
    // iOS "Add to Home Screen" → opens as a standalone app, not in Safari.
    appleWebApp: {
      capable: true,
      title: firm.shortName,
      statusBarStyle: 'default',
    },
  }
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  themeColor: '#ffffff',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;500;600;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600;8..60,700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}