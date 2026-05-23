import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Context',
  description: 'Cognitive continuity for everyday life',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Context',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#F9F3E8',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className="font-sans bg-cream-50 text-warm-900 min-h-svh">
        {children}
      </body>
    </html>
  )
}
