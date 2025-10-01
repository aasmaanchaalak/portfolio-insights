import './globals.css'

export const metadata = {
  title: 'Portfolio Insights',
  description: 'Analyze stock performance with advanced sorting and filtering',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}