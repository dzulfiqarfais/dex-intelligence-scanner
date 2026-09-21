import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'DEX Intelligence Scanner',
  description: 'Live DEX discovery, momentum and market-risk scanner powered by DEX Screener data.',
  applicationName: 'DEX Intelligence Scanner',
  robots: { index: false, follow: false, noarchive: true, nocache: true },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#05070b',
}

export default function RootLayout({children}:{children:React.ReactNode}){
  return <html lang="id"><body>{children}</body></html>
}
