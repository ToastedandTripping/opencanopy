import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import Script from "next/script";
import { R2_PUBLIC_BASE } from "@/lib/r2-config";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-display",
  subsets: ["latin"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://opencanopy.ca"),
  title: "OpenCanopy | Conservation Mapping for BC",
  description:
    "Open-source interactive conservation mapping for British Columbia. Visualize old growth, carbon value, species at risk, and logging threats.",
  openGraph: {
    title: "OpenCanopy | Conservation Mapping for BC",
    description:
      "Open-source interactive conservation mapping for British Columbia. Visualize old growth, carbon value, species at risk, and logging threats.",
    type: "website",
    locale: "en_CA",
    siteName: "OpenCanopy",
  },
  twitter: {
    card: "summary_large_image",
    title: "OpenCanopy",
    description:
      "Open-source conservation mapping for BC. Old growth, carbon, species at risk.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

// Viewport is exported separately per Next 16 API.
// maximumScale: 1 is intentional — prevents iOS auto-zoom on a full-screen map.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${jakarta.variable} ${inter.variable} h-full antialiased dark`}
    >
      <head>
        <link
          rel="preconnect"
          href={R2_PUBLIC_BASE}
          crossOrigin="anonymous"
        />
        <link
          rel="preconnect"
          href="https://api.maptiler.com"
          crossOrigin="anonymous"
        />
      </head>
      <body className="h-full bg-[#0a0a0c] text-white">{children}</body>
      <Script
        src="https://ssc-ops.netlify.app/tracker.js"
        data-site-id="opencanopy"
        data-endpoint="https://ssc-ops.netlify.app/.netlify/functions/track"
        strategy="afterInteractive"
      />
    </html>
  );
}
