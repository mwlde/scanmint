import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ScanMint',
  description: 'Turn a photo of a receipt into structured expense data in one tap.',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "Inter, system-ui, sans-serif",
          margin: 0,
          padding: 0,
          backgroundColor: 'var(--canvas)',
          color: 'var(--ink)',
          WebkitFontSmoothing: 'antialiased',
        }}
      >
        <div
          style={{
            maxWidth: '430px',
            margin: '0 auto',
            minHeight: '100dvh',
            position: 'relative',
            backgroundColor: 'var(--surface)',
          }}
        >
          {children}
        </div>
      </body>
    </html>
  )
}
